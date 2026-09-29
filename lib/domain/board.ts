/**
 * The order board — a tracking surface, not a project-management tool.
 *
 * ── What it is for ─────────────────────────────────────────────────────────────
 * From the 13 Sept call with Niraj: the owner wants a quick view of what is due today, what is in
 * progress and which stage each order has reached; a card should say whether the GTP has been
 * generated and the quotation done, and open the linked documents. The board was also to be made
 * cable-specific rather than a generic Trello board — which is why the card's substance is the
 * DOCUMENT TRAY and the GATES, not a title and a drag handle. The project brief (TRACK_B_BRIEF §4)
 * puts it the same way: the tray "is the Kanban the client asked for".
 *
 * ── What the notes do NOT say ──────────────────────────────────────────────────
 * They name no columns and no move rules. The brief is explicit that stage names are unconfirmed
 * and must not be invented, so the columns are the `OrderStage` union the rest of the app already
 * uses. Nothing here adds a stage.
 *
 * ── Rules this file owns ───────────────────────────────────────────────────────
 *   • A gate is shown BEFORE anyone tries to cross it. The production gate already existed and
 *     already threw — after the click. Naming it on the card is the whole point of the board.
 *   • Cards move one stage at a time. The gates check what they check (an approved GTP and passed
 *     raw-material QC to start; a passed inspection with clearance to dispatch), and a card that
 *     could jump Won → Invoiced would skip the ones the service does not test at that step.
 *   • Overdue and due-today sort to the top of their column; finished work sorts last.
 *
 * Pure: takes the store and `now`, returns plain data. The page adds drag and drop on top.
 */
import { PENDING_CUSTOMER_ID } from "./customer";
import { gtpForOrder } from "./gtp";
import { addDaysIso, INSPECTION_CALL_LEAD_DAYS, inspectionCallBlockers } from "./inspection";
import { dispatchGateBlockers, documentTray, productionGateBlockers } from "./pipeline";
import type {
  CableSpec,
  CableStore,
  Order,
  OrderStage,
  Priority,
  Quote,
  RawMaterialCheck,
} from "../services/types";

// ── Columns ───────────────────────────────────────────────────────────────────

export interface BoardStage {
  stage: OrderStage;
  /** Column heading, in the words on the shop floor. */
  title: string;
  /** One line under the heading saying what being here means. */
  hint: string;
}

export const BOARD_STAGES: readonly BoardStage[] = [
  { stage: "Quoted", title: "Quoted", hint: "Priced and sent — waiting for the customer's order" },
  { stage: "Won", title: "Won", hint: "Order received — GTP to be stamped, material to be checked" },
  { stage: "In Production", title: "In production", hint: "Being made to the stamped GTP" },
  { stage: "Ready for Dispatch", title: "Ready for dispatch", hint: "Inspected and cleared to ship" },
  { stage: "Invoiced", title: "Invoiced", hint: "Shipped and billed — finished" },
];

const STAGE_ORDER = BOARD_STAGES.map((entry) => entry.stage);

export function stageAfter(stage: OrderStage): OrderStage | undefined {
  return STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1];
}

export function stageBefore(stage: OrderStage): OrderStage | undefined {
  return STAGE_ORDER[STAGE_ORDER.indexOf(stage) - 1];
}

/** One step forward or one step back. Never a jump. */
export function isAdjacentMove(from: OrderStage, to: OrderStage): boolean {
  return Math.abs(STAGE_ORDER.indexOf(from) - STAGE_ORDER.indexOf(to)) === 1;
}

// ── Gates ─────────────────────────────────────────────────────────────────────

export type GateName = "Production" | "Dispatch";

export interface TransitionCheck {
  gate: GateName | null;
  /** Plain-language reasons the move cannot happen yet. Empty means clear. */
  blockers: string[];
}

/**
 * What stands between an order and `target`.
 *
 * The single definition of the gate rules: the service's `transition` enforces exactly this, and
 * the board shows exactly this. They used to be two separate `if`s, which is how the production
 * gate came to be enforced without ever being visible.
 */
export function transitionBlockers(store: CableStore, order: Order, target: OrderStage): TransitionCheck {
  if (target === "In Production" && order.stage !== "In Production") {
    return { gate: "Production", blockers: productionGateBlockers(store, order) };
  }
  if (target === "Ready for Dispatch" || target === "Invoiced") {
    return { gate: "Dispatch", blockers: dispatchGateBlockers(store, order) };
  }
  return { gate: null, blockers: [] };
}

// ── Due dates ─────────────────────────────────────────────────────────────────

export type DueBucket = "overdue" | "today" | "soon" | "later" | "done";

export interface DueStatus {
  bucket: DueBucket;
  /** Whole days until the promised date; negative when overdue. */
  days: number;
  /** "Overdue by 6 days", "Due today", "Due in 3 days", "Delivered". */
  label: string;
}

/** A week is "soon" — the horizon at which a factory can still change what it does. */
const SOON_DAYS = 7;

/** Whole days from `now` to the promised date, on the works' own (IST) calendar day. */
export function daysUntilPromised(now: Date, promisedDate: string): number {
  const due = new Date(`${promisedDate.slice(0, 10)}T00:00:00+05:30`).getTime();
  // `+ 0` turns -0 into 0: a date earlier today rounds to negative zero, which prints as "-0".
  return Math.ceil((due - now.getTime()) / 86_400_000) + 0;
}

export function dueStatus(order: Pick<Order, "stage" | "promisedDate">, now: Date): DueStatus {
  if (order.stage === "Invoiced") return { bucket: "done", days: 0, label: "Finished" };
  const days = daysUntilPromised(now, order.promisedDate);
  const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  if (days < 0) return { bucket: "overdue", days, label: `Overdue by ${plural(-days)}` };
  if (days === 0) return { bucket: "today", days, label: "Due today" };
  if (days <= SOON_DAYS) return { bucket: "soon", days, label: `Due in ${plural(days)}` };
  return { bucket: "later", days, label: `Due in ${plural(days)}` };
}

const DUE_RANK: Record<DueBucket, number> = { overdue: 0, today: 1, soon: 2, later: 3, done: 4 };

// ── Document tray ─────────────────────────────────────────────────────────────

/**
 * How a document reads at a glance.
 *   ok       — done and needs nothing
 *   waiting  — exists, someone still has to act
 *   problem  — exists and something is wrong (failed, sent back)
 *   missing  — not created yet
 */
export type TrayState = "ok" | "waiting" | "problem" | "missing";

export interface TrayLink {
  id: string;
  status: string;
  /** Only set when the page exists in this build. */
  href?: string;
}

export interface TrayItem {
  label: string;
  state: TrayState;
  /** What to print beside the label: "Approved", "1 of 3 cables covered", "Not started". */
  text: string;
  records: TrayLink[];
}

/**
 * The routes that exist in this build.
 *
 * The document tray comes from the shared pipeline model, whose links also point at job-card and
 * dispatch pages that Cable OS 3 removed on purpose — so that a dead tab could not be reached by
 * typing its URL. Linking to them from a card would turn every one into a 404. They stay visible
 * as status, and become links the day their pages come back.
 */
const LIVE_ROUTES = ["/quote/", "/gtp/review"];

export function liveHref(href: string): string | undefined {
  return LIVE_ROUTES.some((prefix) => href.startsWith(prefix)) ? href : undefined;
}

function trayState(label: string, status: string): TrayState {
  const s = status.toLowerCase();
  switch (label) {
    case "Quote":
      return s === "rejected" ? "problem" : s === "approved" || s === "on board" ? "ok" : "waiting";
    case "GTP":
      return s === "approved" ? "ok" : s === "corrections received" ? "problem" : "waiting";
    case "Job card":
      return "ok";
    case "Inspection":
      return s.startsWith("failed") ? "problem" : s.startsWith("passed") && s.includes("di issued") ? "ok" : "waiting";
    case "Dispatch":
      return s === "dispatched" || s === "checklist complete" ? "ok" : "waiting";
    default:
      return "waiting";
  }
}

const WORST: TrayState[] = ["problem", "waiting", "ok"];

/** The five documents, always in the same order, whether or not they exist yet. */
function buildTray(store: CableStore, order: Order, cables: { specId: string }[]): TrayItem[] {
  const specIds = new Set(cables.map((cable) => cable.specId));
  return documentTray(store, order.inquiryId, order.id).map((group) => {
    const records: TrayLink[] = group.records.map((record) => ({
      id: record.id,
      status: record.status,
      href: liveHref(record.href),
    }));
    if (records.length === 0) {
      return { label: group.label, state: "missing", text: "Not started", records };
    }
    const states = group.records.map((record) => trayState(group.label, record.status));
    const state = WORST.find((candidate) => states.includes(candidate)) ?? "ok";
    let text = records.length === 1 ? records[0].status : `${records.length} records`;

    if (group.label === "GTP" && specIds.size > 1) {
      // A quote can cover several cables and each is meant to have its own GTP (Niraj, 13 Sept).
      // Until orders carry one, say how many are actually covered rather than letting one
      // approved GTP read as "the GTP" for an order of three cables.
      const gtps = store.gtps.filter((gtp) => group.records.some((record) => record.id === gtp.id));
      const covered = [...specIds].filter((id) => gtps.some((gtp) => gtp.specId === id)).length;
      text = `${text} · covers ${covered} of ${specIds.size} cables`;
      if (covered < specIds.size && state === "ok") return { label: group.label, state: "waiting", text, records };
    }
    return { label: group.label, state, text, records };
  });
}

// ── Cards ─────────────────────────────────────────────────────────────────────

export interface BoardCable {
  specId: string;
  /** "3.5Cx240 Al". */
  label: string;
  lengthM: number;
}

/**
 * Where an order stands on calling the inspector.
 *
 * The call has to go in about ten days before the cable is ready — the inspector then takes ten or
 * eleven days to arrive — and a late call leaves finished cable sitting on the floor, which the
 * project brief names as the most expensive mistake the platform can prevent. So the board says so
 * on the card, in the column where it matters, rather than leaving it in a service nobody opens.
 */
export interface InspectionCallInfo {
  state: "none" | "scheduled" | "due" | "overdue" | "called";
  /** Days until the call-by date; negative when it has passed. */
  days?: number;
  callBy?: string;
  /** Inspector's expected arrival, once the call is placed. */
  eta?: string;
}

export function inspectionCallInfo(order: Order, now: Date): InspectionCallInfo {
  if (order.inspectionStatus && order.inspectionStatus !== "Not called") {
    return order.inspectionStatus === "Called" ? { state: "called", eta: order.inspectorEtaDate } : { state: "none" };
  }
  if (!order.estimatedCompletionDate) return { state: "none" };
  const callBy = addDaysIso(order.estimatedCompletionDate, -INSPECTION_CALL_LEAD_DAYS);
  const days = daysUntilPromised(now, callBy);
  // Within three days of the call-by date is "due"; past it is "overdue".
  return { state: days < 0 ? "overdue" : days <= 3 ? "due" : "scheduled", days, callBy };
}

export interface BoardCard {
  orderId: string;
  stage: OrderStage;
  customerName: string;
  /** Every cable on the order, not just the first — a real order carries several. */
  cables: BoardCable[];
  totalMetres: number;
  amountInr: number;
  priority: Priority;
  promisedDate: string;
  due: DueStatus;
  tray: TrayItem[];
  nextStage?: OrderStage;
  previousStage?: OrderStage;
  /** Why the card cannot move forward yet. Empty means it can. */
  nextBlockers: string[];
  nextGate: GateName | null;
  /** Won, and the production gate is still shut — "waiting to start". */
  waitingToStart: boolean;
  /** Only meaningful while the cable is being made. */
  inspectionCall: InspectionCallInfo;
  /** Why the inspector cannot be called yet. Empty means the call can go in. */
  inspectionCallBlockers: string[];
}

function metalAbbreviation(spec: CableSpec): string {
  return spec.conductorMaterial === "Copper" || spec.conductorMaterial === "Tinned Copper" ? "Cu" : "Al";
}

function cablesFor(store: CableStore, order: Order, quote: Quote | undefined): BoardCable[] {
  const lines = quote?.lines ?? [];
  if (lines.length === 0) {
    // No quote to read cables from — an order whose quote was deleted, or a repeat order carrying
    // only its summary. Show what the order itself says, without inventing a spec id.
    return [{ specId: "", label: order.specSummary || order.title, lengthM: 0 }];
  }
  return lines.map((line) => {
    const spec = store.specs.find((entry) => entry.id === line.specId);
    return {
      specId: line.specId,
      label: spec ? `${spec.designation} ${metalAbbreviation(spec)}` : line.specId,
      lengthM: line.lengthM,
    };
  });
}

export function buildCard(store: CableStore, order: Order, now: Date): BoardCard {
  const quote = store.quotes.find((entry) => entry.id === order.quoteId);
  const cables = cablesFor(store, order, quote);
  const nextStage = stageAfter(order.stage);
  const next = nextStage ? transitionBlockers(store, order, nextStage) : { gate: null, blockers: [] };
  return {
    orderId: order.id,
    stage: order.stage,
    customerName:
      store.customers.find((entry) => entry.id === order.customerId)?.name ??
      (order.customerId === PENDING_CUSTOMER_ID ? "No customer chosen" : "Customer not found"),
    cables,
    totalMetres: cables.reduce((sum, cable) => sum + cable.lengthM, 0),
    amountInr: order.amountInr,
    priority: order.priority,
    promisedDate: order.promisedDate,
    due: dueStatus(order, now),
    tray: buildTray(store, order, cables.filter((cable) => cable.specId)),
    nextStage,
    previousStage: stageBefore(order.stage),
    nextBlockers: next.blockers,
    nextGate: next.gate,
    waitingToStart: order.stage === "Won" && next.blockers.length > 0,
    inspectionCall: order.stage === "In Production" ? inspectionCallInfo(order, now) : { state: "none" },
    inspectionCallBlockers: inspectionCallBlockers(store.finishedCableQc, order.id),
  };
}

function compareCards(a: BoardCard, b: BoardCard): number {
  return (
    DUE_RANK[a.due.bucket] - DUE_RANK[b.due.bucket] ||
    a.promisedDate.localeCompare(b.promisedDate) ||
    a.orderId.localeCompare(b.orderId)
  );
}

export interface BoardColumn extends BoardStage {
  cards: BoardCard[];
}

export function buildBoard(store: CableStore, now: Date): BoardColumn[] {
  const cards = store.orders.map((order) => buildCard(store, order, now));
  return BOARD_STAGES.map((stage) => ({
    ...stage,
    cards: cards.filter((card) => card.stage === stage.stage).sort(compareCards),
  }));
}

// ── The owner's overview ──────────────────────────────────────────────────────

export type BoardFilter = "all" | "overdue" | "today" | "inProduction" | "waiting";

export interface BoardSummary {
  overdue: number;
  dueToday: number;
  inProduction: number;
  waitingToStart: number;
}

const isFinished = (card: BoardCard) => card.stage === "Invoiced";

export function summarize(columns: BoardColumn[]): BoardSummary {
  const cards = columns.flatMap((column) => column.cards);
  return {
    overdue: cards.filter((card) => !isFinished(card) && card.due.bucket === "overdue").length,
    dueToday: cards.filter((card) => card.due.bucket === "today").length,
    inProduction: cards.filter((card) => card.stage === "In Production").length,
    waitingToStart: cards.filter((card) => card.waitingToStart).length,
  };
}

export function matchesFilter(card: BoardCard, filter: BoardFilter): boolean {
  switch (filter) {
    case "overdue":
      return !isFinished(card) && card.due.bucket === "overdue";
    case "today":
      return card.due.bucket === "today";
    case "inProduction":
      return card.stage === "In Production";
    case "waiting":
      return card.waitingToStart;
    default:
      return true;
  }
}

// ── Defaults an order is created with ─────────────────────────────────────────

/**
 * Lead time when nobody has set one: the works' own standing term, "as per your requirement with
 * lead time of 2 weeks" (Daksha offer terms, DCIPL/71/2026-27). An order used to be created with
 * the literal date 2026-07-08, so "due today" could never be true of a new one.
 */
export const DEFAULT_LEAD_TIME_DAYS = 14;

export function defaultPromisedDate(now: Date, leadTimeDays = DEFAULT_LEAD_TIME_DAYS): string {
  const due = new Date(now.getTime() + leadTimeDays * 86_400_000);
  // The calendar date on the works' clock, not UTC: at 02:00 IST it is still yesterday in UTC.
  return new Date(due.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * The GTP an order should adopt from the quote it came from, if any.
 *
 * Every quote in Cable OS 3 begins from a GTP (`Quote.gtpId`), and the price is built from that
 * GTP's cable. Turning the quote into an order used to draft a NEW GTP from the spec instead — a
 * different, section-only document — so the engineer stamped something other than the GTP the
 * price came from, and the one that was priced sat orphaned. The order takes the quote's GTP.
 *
 * Only when it is free. A GTP already attached to a different order is that order's, and this one
 * falls back to the reuse rules (`findReusableGtp`), which copy an APPROVED GTP for a repeat order.
 */
export function gtpToAdopt(store: CableStore, quote: Pick<Quote, "gtpId">, order: Pick<Order, "id">) {
  if (!quote.gtpId) return undefined;
  const gtp = store.gtps.find((entry) => entry.id === quote.gtpId);
  if (!gtp || gtp.isTemplate) return undefined;
  return !gtp.orderId || gtp.orderId === order.id ? gtp : undefined;
}

/** "3 cables" or the one cable's name — what an order is called when nobody has named it. */
export function orderTitleFor(store: CableStore, quote: Pick<Quote, "lines">): string {
  const names = quote.lines.map(
    (line) => store.specs.find((spec) => spec.id === line.specId)?.designation ?? line.specId,
  );
  if (names.length === 0) return "Cable order";
  return names.length === 1 ? names[0] : `${names[0]} + ${names.length - 1} more cable${names.length === 2 ? "" : "s"}`;
}

// ── Incoming raw-material QC ──────────────────────────────────────────────────

/**
 * The five incoming checks this plant runs — taken from the seeded record for its first order
 * rather than invented, and in its order.
 */
export const INCOMING_QC_CHECKS = [
  { id: "rm-visual", label: "Visual check" },
  { id: "rm-dimension", label: "Dimension check" },
  { id: "rm-smoothness", label: "Surface smoothness" },
  { id: "rm-electrical", label: "Electrical test (conductivity)" },
  { id: "rm-mechanical", label: "Mechanical test (tensile/elongation)" },
] as const;

/**
 * A blank incoming-QC record for an order, every check pending.
 *
 * The production gate requires one, and converting a quote to an order does not create it — so
 * without this an order could never leave "Won" in a build that has no other screen to record QC.
 */
export function blankIncomingQc(store: CableStore, order: Order): RawMaterialCheck {
  const quote = store.quotes.find((entry) => entry.id === order.quoteId);
  const specs = (quote?.lines ?? [])
    .map((line) => store.specs.find((spec) => spec.id === line.specId))
    .filter((spec): spec is CableSpec => Boolean(spec));
  const materials = new Set<string>();
  for (const spec of specs) {
    materials.add(`${spec.conductorMaterial} conductor`);
    materials.add(spec.insulation);
    if (spec.armour !== "Unarmoured") materials.add(spec.armour);
  }
  return {
    id: `RMC-${order.id}`,
    orderId: order.id,
    materialType: materials.size > 0 ? [...materials].join(" + ") : "Incoming raw material",
    checks: INCOMING_QC_CHECKS.map((check) => ({ ...check, result: "Pending" as const })),
  };
}

/** The GTP the order is waiting on, if there is one — for the card's link and wording. */
export function orderGtp(store: CableStore, order: Order) {
  return gtpForOrder(store.gtps, order);
}
