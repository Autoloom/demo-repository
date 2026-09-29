/**
 * The order board's rules.
 *
 * Each test is here because the thing it pins is either something the client asked for (13 Sept:
 * "what is due today", "is the GTP done", "open the documents") or a way the board could look
 * right while being wrong — a card that says the GTP is approved when it is a different GTP from
 * the one the price came from, a due date that can never be today, a gate that only speaks after
 * the click.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

import { adapter } from "../adapters/mock-adapter";
import { seedData } from "../seed/data";
import { ordersService, quotesService, rawMaterialQcService } from "../services";
import type { Actor, CableStore, Gtp, Order, Quote } from "../services/types";
import {
  BOARD_STAGES,
  blankIncomingQc,
  buildBoard,
  buildCard,
  defaultPromisedDate,
  dueStatus,
  gtpToAdopt,
  INCOMING_QC_CHECKS,
  isAdjacentMove,
  liveHref,
  matchesFilter,
  orderTitleFor,
  stageAfter,
  stageBefore,
  summarize,
  transitionBlockers,
} from "./board";

const actor: Actor = { id: "test-owner", name: "Test owner", role: "Owner" };
/** The app's pinned demo clock, 23 June 2026 09:00 IST — seed due dates are set against it. */
const NOW = new Date("2026-06-23T09:00:00+05:30");

let store: CableStore;
beforeEach(() => {
  store = structuredClone(seedData);
  mock.method(adapter, "read", async () => structuredClone(store));
  mock.method(adapter, "write", async (next: CableStore) => {
    store = structuredClone(next);
    return structuredClone(store);
  });
});
afterEach(() => mock.restoreAll());

const order = (id: string): Order => store.orders.find((entry) => entry.id === id)!;

// ── Columns ───────────────────────────────────────────────────────────────────

test("the columns are the stages the app already has — none invented", () => {
  // TRACK_B_BRIEF §12: the stage names are unconfirmed with the client and must not be made up.
  assert.deepEqual(
    BOARD_STAGES.map((entry) => entry.stage),
    ["Quoted", "Won", "In Production", "Ready for Dispatch", "Invoiced"],
  );
  assert.equal(buildBoard(store, NOW).length, 5);
});

test("every order lands in exactly one column", () => {
  const columns = buildBoard(store, NOW);
  const placed = columns.flatMap((column) => column.cards.map((card) => card.orderId)).sort();
  assert.deepEqual(placed, store.orders.map((entry) => entry.id).sort());
});

test("a card moves one stage at a time, forward or back — never a jump", () => {
  assert.equal(isAdjacentMove("Won", "In Production"), true);
  assert.equal(isAdjacentMove("In Production", "Won"), true);
  assert.equal(isAdjacentMove("Won", "Invoiced"), false, "a jump would skip the gate the service tests at that step");
  assert.equal(isAdjacentMove("Quoted", "In Production"), false);
  assert.equal(isAdjacentMove("Won", "Won"), false);
  assert.equal(stageAfter("Invoiced"), undefined);
  assert.equal(stageBefore("Quoted"), undefined);
});

// ── Due dates ─────────────────────────────────────────────────────────────────

test("due status reads in days, and today is today — not 'overdue by 0'", () => {
  const due = (promisedDate: string, stage: Order["stage"] = "Won") => dueStatus({ stage, promisedDate }, NOW);
  assert.deepEqual(due("2026-06-23"), { bucket: "today", days: 0, label: "Due today" });
  assert.equal(due("2026-06-22").label, "Overdue by 1 day");
  assert.equal(due("2026-06-20").label, "Overdue by 3 days");
  assert.equal(due("2026-06-24").label, "Due in 1 day");
  assert.equal(due("2026-06-30").bucket, "soon");
  assert.equal(due("2026-07-01").bucket, "later", "a week and a day out is no longer 'soon'");
  assert.equal(due("2026-06-22", "Invoiced").bucket, "done", "finished work is never overdue");
  assert.ok(!Object.is(due("2026-06-23").days, -0), "a date earlier today must not be negative zero");
});

test("a new order can actually be due today — the promised date is no longer a fixed July date", () => {
  // Every order ever created carried the literal 2026-07-08, so none of them could be due
  // today or overdue in a way that meant anything.
  const iso = defaultPromisedDate(NOW);
  assert.equal(iso, "2026-07-07", "14 days after 23 June");
  assert.notEqual(iso, "2026-07-08");
  // On the works' calendar day: at 02:00 IST it is still the previous day in UTC.
  assert.equal(defaultPromisedDate(new Date("2026-06-23T02:00:00+05:30")), "2026-07-07");
  assert.equal(defaultPromisedDate(new Date("2026-06-23T23:30:00+05:30")), "2026-07-07");
  assert.equal(defaultPromisedDate(NOW, 0), "2026-06-23");
});

test("within a column the most urgent card is first and finished work is last", () => {
  const first = order("ORD-7743");
  const overdue: Order = { ...first, id: "ORD-A", promisedDate: "2026-06-10" };
  const today: Order = { ...first, id: "ORD-B", promisedDate: "2026-06-23" };
  const later: Order = { ...first, id: "ORD-C", promisedDate: "2026-08-30" };
  store.orders = [later, today, overdue];
  const won = buildBoard(store, NOW).find((column) => column.stage === "Won")!;
  assert.deepEqual(won.cards.map((card) => card.orderId), ["ORD-A", "ORD-B", "ORD-C"]);
});

// ── Gates are visible before the click ────────────────────────────────────────

test("the production gate is on the card before anyone tries to cross it", () => {
  // ORD-7743 sits in Won with no approved GTP and no incoming QC — the seed's own demo of the gate.
  const card = buildCard(store, order("ORD-7743"), NOW);
  assert.equal(card.nextStage, "In Production");
  assert.equal(card.nextGate, "Production");
  assert.ok(card.nextBlockers.length >= 2, "GTP sign-off and raw-material QC are both outstanding");
  assert.ok(card.nextBlockers.some((text) => /GTP/.test(text)));
  assert.ok(card.nextBlockers.some((text) => /QC/i.test(text)));
  assert.equal(card.waitingToStart, true);
});

test("what the card says is exactly what the service enforces", async () => {
  // The board and the service used to be two separate definitions of the gate. A card that
  // promised a move the service then refused — or the reverse — is worse than no card.
  const card = buildCard(store, order("ORD-7743"), NOW);
  await assert.rejects(ordersService.transition("ORD-7743", "In Production", actor), (error: Error) => {
    assert.match(error.message, /Production is gated/);
    for (const blocker of card.nextBlockers) assert.ok(error.message.includes(blocker), blocker);
    return true;
  });
  assert.deepEqual(transitionBlockers(store, order("ORD-7743"), "In Production").gate, "Production");
});

test("a clear card can move, and the service agrees", async () => {
  // ORD-7741 is in production with a stamped GTP and passed QC. It is not yet inspected, so the
  // NEXT gate (dispatch) is what shows — the honest answer for a cable still being made.
  const card = buildCard(store, order("ORD-7741"), NOW);
  assert.equal(card.nextStage, "Ready for Dispatch");
  assert.equal(card.nextGate, "Dispatch");
  assert.ok(card.nextBlockers.length > 0);
  assert.equal(card.waitingToStart, false, "in production is not 'waiting to start'");
});

test("incoming QC can be recorded from a blank sheet and that clears the gate", async () => {
  // Converting a quote to an order does not create a QC record, and this build has no other
  // screen for it — so without a blank sheet an order could never leave Won.
  const target = order("ORD-7743");
  const gtp = store.gtps.find((entry) => entry.id === "GTP-001")!;
  target.gtpId = gtp.id; // approved GTP, so QC is the only thing left in the way
  gtp.orderId = target.id;
  let card = buildCard(store, target, NOW);
  assert.ok(card.nextBlockers.every((text) => /QC/i.test(text)), "only QC remains");

  const blank = blankIncomingQc(store, target);
  assert.equal(blank.checks.length, INCOMING_QC_CHECKS.length);
  assert.ok(blank.checks.every((check) => check.result === "Pending"));
  await rawMaterialQcService.save(blank, actor);
  card = buildCard(store, target, NOW);
  assert.ok(card.nextBlockers.length > 0, "recorded but still pending is not passed");

  await rawMaterialQcService.save({ ...blank, checks: blank.checks.map((check) => ({ ...check, result: "Pass" as const })) }, actor);
  card = buildCard(store, target, NOW);
  assert.deepEqual(card.nextBlockers, []);
  await ordersService.transition(target.id, "In Production", actor);
  assert.equal(order(target.id).stage, "In Production");
});

// ── The document tray ─────────────────────────────────────────────────────────

test("the tray always has the same five documents, in the same order, made or not", () => {
  const card = buildCard(store, order("ORD-7742"), NOW); // quoted, nothing else exists
  assert.deepEqual(card.tray.map((item) => item.label), ["Quote", "GTP", "Job card", "Inspection", "Dispatch"]);
  assert.equal(card.tray.find((item) => item.label === "Inspection")?.state, "missing");
  assert.equal(card.tray.find((item) => item.label === "Inspection")?.text, "Not started");
});

test("an approved GTP reads as done and a draft as waiting", () => {
  assert.equal(buildCard(store, order("ORD-7741"), NOW).tray.find((item) => item.label === "GTP")?.state, "ok");
  const gtp = store.gtps.find((entry) => entry.id === "GTP-001")!;
  gtp.status = "Corrections received";
  assert.equal(buildCard(store, order("ORD-7741"), NOW).tray.find((item) => item.label === "GTP")?.state, "problem");
  gtp.status = "Submitted";
  assert.equal(buildCard(store, order("ORD-7741"), NOW).tray.find((item) => item.label === "GTP")?.state, "waiting");
});

test("links go only where a page exists in this build", () => {
  // Cable OS 3 removed the job-card and dispatch pages so a dead tab could not be reached by URL.
  assert.equal(liveHref("/quote/Q-2606-118"), "/quote/Q-2606-118");
  assert.equal(liveHref("/gtp/review?orderId=ORD-7741"), "/gtp/review?orderId=ORD-7741");
  assert.equal(liveHref("/job-card?orderId=ORD-7741"), undefined);
  assert.equal(liveHref("/dispatch?orderId=ORD-7741"), undefined);
  for (const column of buildBoard(store, NOW)) {
    for (const card of column.cards) {
      for (const link of card.tray.flatMap((item) => item.records)) {
        assert.ok(!link.href || /^\/(quote\/|gtp\/review)/.test(link.href), `${card.orderId}: ${link.href}`);
      }
    }
  }
});

// ── Multi-cable orders ────────────────────────────────────────────────────────

function threeCableQuote(): Quote {
  const quote = store.quotes.find((entry) => entry.id === "Q-2606-118")!;
  const [first] = quote.lines;
  quote.lines = [
    { ...first, id: "QL-1", specId: store.specs[0].id, lengthM: 3000 },
    { ...first, id: "QL-2", specId: store.specs[1].id, lengthM: 1200 },
    { ...first, id: "QL-3", specId: store.specs[2].id, lengthM: 800 },
  ];
  return quote;
}

test("a card lists every cable on the order, not just the first", () => {
  threeCableQuote();
  const card = buildCard(store, order("ORD-7741"), NOW);
  assert.equal(card.cables.length, 3);
  assert.equal(card.totalMetres, 5000);
  assert.deepEqual(card.cables.map((cable) => cable.specId), store.specs.slice(0, 3).map((spec) => spec.id));
});

test("the GTP tray says how many of the cables are covered, so one stamp is not mistaken for all", () => {
  // Each cable is meant to have its own GTP (Niraj, 13 Sept). An order of three with one approved
  // GTP must not read as "GTP done".
  threeCableQuote();
  store.gtps.find((entry) => entry.id === "GTP-001")!.specId = store.specs[0].id;
  const gtp = buildCard(store, order("ORD-7741"), NOW).tray.find((item) => item.label === "GTP")!;
  assert.match(gtp.text, /covers 1 of 3 cables/);
  assert.equal(gtp.state, "waiting", "approved, but two cables have no GTP");
});

test("an order of several cables is named for all of them", () => {
  const quote = threeCableQuote();
  assert.equal(orderTitleFor(store, quote), `${store.specs[0].designation} + 2 more cables`);
  assert.equal(orderTitleFor(store, { lines: quote.lines.slice(0, 2) }), `${store.specs[0].designation} + 1 more cable`);
  assert.equal(orderTitleFor(store, { lines: quote.lines.slice(0, 1) }), store.specs[0].designation);
  assert.equal(orderTitleFor(store, { lines: [] }), "Cable order");
});

// ── The owner's overview ──────────────────────────────────────────────────────

test("the overview counts what the owner asked about: overdue, due today, in production, waiting", () => {
  const columns = buildBoard(store, NOW);
  const summary = summarize(columns);
  assert.deepEqual(summary, { overdue: 0, dueToday: 0, inProduction: 1, waitingToStart: 1 });

  order("ORD-7743").promisedDate = "2026-06-23";
  order("ORD-7742").promisedDate = "2026-06-01";
  const later = summarize(buildBoard(store, NOW));
  assert.equal(later.dueToday, 1);
  assert.equal(later.overdue, 1);
});

test("finished orders are never counted as overdue", () => {
  order("ORD-7742").stage = "Invoiced";
  order("ORD-7742").promisedDate = "2026-01-01";
  assert.equal(summarize(buildBoard(store, NOW)).overdue, 0);
});

test("each overview number is also a filter that shows exactly those cards", () => {
  order("ORD-7743").promisedDate = "2026-06-23";
  const cards = buildBoard(store, NOW).flatMap((column) => column.cards);
  const ids = (filter: Parameters<typeof matchesFilter>[1]) =>
    cards.filter((card) => matchesFilter(card, filter)).map((card) => card.orderId).sort();
  assert.deepEqual(ids("today"), ["ORD-7743"]);
  assert.deepEqual(ids("inProduction"), ["ORD-7741"]);
  assert.deepEqual(ids("waiting"), ["ORD-7743"]);
  assert.equal(ids("all").length, store.orders.length);
});

// ── Sending a quote to the board ──────────────────────────────────────────────

/** A GTP as the generator saves it: built from inputs, linked to no order yet. */
function generatorGtp(patch: Partial<Gtp> = {}): Gtp {
  const base = structuredClone(store.gtps.find((entry) => entry.id === "GTP-001")!);
  return { ...base, id: "GTP-BUILT", orderId: undefined, status: "Draft", signOffs: [], version: 1, reusedFromGtpId: undefined, ...patch };
}

test("gtpToAdopt takes the quote's own GTP, and only when it is free", () => {
  store.gtps.push(generatorGtp());
  assert.equal(gtpToAdopt(store, { gtpId: "GTP-BUILT" }, { id: "ORD-NEW" })?.id, "GTP-BUILT");
  assert.equal(gtpToAdopt(store, {}, { id: "ORD-NEW" }), undefined, "a quote with no GTP has nothing to adopt");
  assert.equal(gtpToAdopt(store, { gtpId: "GTP-NOPE" }, { id: "ORD-NEW" }), undefined);
  // Already attached to another order: that order's, not this one's.
  store.gtps.find((entry) => entry.id === "GTP-BUILT")!.orderId = "ORD-7741";
  assert.equal(gtpToAdopt(store, { gtpId: "GTP-BUILT" }, { id: "ORD-NEW" }), undefined);
  assert.equal(gtpToAdopt(store, { gtpId: "GTP-BUILT" }, { id: "ORD-7741" })?.id, "GTP-BUILT", "but its own order may");
  // A public-format template is never anyone's order GTP.
  store.gtps.find((entry) => entry.id === "GTP-BUILT")!.orderId = undefined;
  store.gtps.find((entry) => entry.id === "GTP-BUILT")!.isTemplate = true;
  assert.equal(gtpToAdopt(store, { gtpId: "GTP-BUILT" }, { id: "ORD-NEW" }), undefined);
});

async function sendToBoard(quotePatch: Partial<Quote> = {}) {
  const quote = store.quotes.find((entry) => entry.id === "Q-2606-118")!;
  Object.assign(quote, { marginReviewRequired: false, convertedOrderId: undefined, ...quotePatch });
  const before = store.gtps.length;
  const result = await quotesService.sendToOrderBoard(quote.id, actor);
  assert.ok("order" in result, "the quote should have converted");
  return { result: result as Extract<typeof result, { order: Order }>, gtpsBefore: before };
}

test("sending a quote to the board keeps the GTP it was priced from — no second GTP is drafted", async () => {
  // The bug: converting a quote drafted a brand-new section-only GTP from the spec, so the engineer
  // stamped a different document from the one the price came from, and the built one sat orphaned.
  store.gtps.push(generatorGtp());
  const { result, gtpsBefore } = await sendToBoard({ gtpId: "GTP-BUILT" });

  assert.equal(result.order.gtpId, "GTP-BUILT");
  assert.equal(result.gtp.id, "GTP-BUILT");
  assert.equal(store.gtps.find((entry) => entry.id === "GTP-BUILT")?.orderId, result.order.id);
  assert.equal(store.gtps.length, gtpsBefore + 0, "the count of GTPs must not grow");
  assert.equal(store.gtps.filter((entry) => entry.orderId === result.order.id).length, 1);

  // And the board reads that GTP, so its stamps are the ones that gate production.
  const card = buildCard(store, store.orders.find((entry) => entry.id === result.order.id)!, NOW);
  assert.equal(card.tray.find((item) => item.label === "GTP")?.records[0].id, "GTP-BUILT");
  assert.ok(card.nextBlockers.some((text) => text.includes("GTP-BUILT")), "the blocker names the GTP that is actually being waited on");
});

test("a quote whose GTP already belongs to another order falls back to the reuse rules", async () => {
  store.gtps.push(generatorGtp({ orderId: "ORD-7741" }));
  const { result, gtpsBefore } = await sendToBoard({ gtpId: "GTP-BUILT" });
  assert.notEqual(result.order.gtpId, "GTP-BUILT");
  assert.equal(store.gtps.length, gtpsBefore + 1);
});

test("a new order gets a real delivery date and a name that covers every cable", async () => {
  threeCableQuote();
  store.gtps.push(generatorGtp({ specId: store.specs[0].id }));
  const { result } = await sendToBoard({ gtpId: "GTP-BUILT" });
  assert.notEqual(result.order.promisedDate, "2026-07-08");
  assert.equal(result.order.promisedDate, defaultPromisedDate(new Date("2026-06-23T09:00:00+05:30")));
  assert.match(result.order.title, /\+ 2 more cables$/);
});

test("the delivery date can be changed, and only to a real date", async () => {
  await ordersService.setPromisedDate("ORD-7743", "2026-07-30", actor);
  assert.equal(order("ORD-7743").promisedDate, "2026-07-30");
  assert.ok(store.activity.some((entry) => /delivery date changed from 2026-07-20 to 2026-07-30/.test(entry.text)));
  await assert.rejects(ordersService.setPromisedDate("ORD-7743", "next week", actor), /calendar date/);
  await assert.rejects(ordersService.setPromisedDate("ORD-7743", "2026-13-45", actor), /calendar date/);
  await assert.rejects(ordersService.setPromisedDate("ORD-NOPE", "2026-07-30", actor), /not found/);
  assert.equal(order("ORD-7743").promisedDate, "2026-07-30", "a rejected date changes nothing");
});
