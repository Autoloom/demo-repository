/**
 * Signal engine — pure rules over current store state.
 *
 * These are the "AI signals" surfaced on the Dashboard, Sales Board, and Contacts. Phase 1 ships
 * the sales-acceleration signals as deterministic heuristics (no LLM, no training data): lead
 * scoring, follow-up detection, and repeat-order radar. Later phases can layer ML/LLM scoring
 * behind the same `Signal` shape without touching any page.
 *
 * Everything here is a pure function of the store + pinned `now()`, so results are reproducible
 * and trivially unit-testable. No I/O, no `new Date()` — dates go through `daysUntil`.
 *
 * See: cable os plans/foundation/data-models.md §11, pages/02-sales-board.md, pages/01-dashboard.md.
 */
import { daysUntil } from "@/lib/domain/clock";
import type {
  Customer,
  Inquiry,
  Order,
  Signal,
  SignalType,
} from "@/lib/services/types";

/** Subset of the store the engine reads. Keeps the engine decoupled from the adapter. */
export interface SignalInputs {
  inquiries: Inquiry[];
  orders: Order[];
  customers: Customer[];
}

/** Inquiry stages that are still live (a lost/won/converted inquiry is not actionable). */
const OPEN_INQUIRY_STAGES: ReadonlyArray<Inquiry["stage"]> = ["New", "Quoting", "Quote sent"];

/** Typical days between repeat orders before we nudge the account. Tune from real data later. */
const REPEAT_ORDER_CADENCE_DAYS = 90;

function severityFromScore(score: number): Signal["severity"] {
  if (score >= 70) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ── 1. Lead scoring ──────────────────────────────────────────────────────────
// Win-probability heuristic over fields the platform already captures. Pure points model so the
// score is explainable: each contribution is also returned as a plain-language reason.

/** Source quality — repeat business converts far more often than a cold website form. */
const SOURCE_POINTS: Record<Inquiry["source"], { points: number; reason: string }> = {
  "Repeat order": { points: 35, reason: "Repeat customer — high intent" },
  Referral: { points: 28, reason: "Came via referral" },
  "Distributor call": { points: 22, reason: "Distributor-sourced" },
  "Tender portal": { points: 16, reason: "Tender — competitive but high value" },
  Website: { points: 8, reason: "Inbound website lead" },
};

/** Segment quality — larger, recurring buyers are worth prioritising. */
const SEGMENT_POINTS: Partial<Record<Customer["segment"], number>> = {
  "EPC contractor": 18,
  "Utility distributor": 16,
  "Government/PSU": 14,
  OEM: 12,
  "Solar installer": 10,
  "Civil contractor": 8,
  "Trader/Dealer": 6,
};

export interface LeadScore {
  score: number; // 0–100
  reasons: string[];
}

/** Score one inquiry's win-likelihood from its own fields + its customer. Pure + explainable. */
export function scoreInquiry(inquiry: Inquiry, customer: Customer | undefined): LeadScore {
  const reasons: string[] = [];
  let score = 0;

  const source = SOURCE_POINTS[inquiry.source];
  score += source.points;
  reasons.push(source.reason);

  if (customer) {
    const segPoints = SEGMENT_POINTS[customer.segment] ?? 0;
    if (segPoints > 0) {
      score += segPoints;
      reasons.push(`${customer.segment} segment`);
    }
  }

  // Value tier — bigger deals earn priority (capped so a single huge deal can't dominate).
  if (inquiry.estimatedValueInr >= 10_000_000) {
    score += 22;
    reasons.push("Large deal (₹1 Cr+)");
  } else if (inquiry.estimatedValueInr >= 5_000_000) {
    score += 14;
    reasons.push("Sizeable deal (₹50 L+)");
  } else if (inquiry.estimatedValueInr >= 1_000_000) {
    score += 7;
    reasons.push("Mid-size deal");
  }

  // Stage momentum — a quote already sent is closer to closing than a brand-new inquiry.
  if (inquiry.stage === "Quote sent") {
    score += 12;
    reasons.push("Quote already sent");
  } else if (inquiry.stage === "Quoting") {
    score += 6;
    reasons.push("Actively being quoted");
  }

  // Freshness — a follow-up that is due now is more actionable; long-overdue leads decay.
  const daysToFollowUp = daysUntil(inquiry.followUpDate);
  if (daysToFollowUp <= 0 && daysToFollowUp >= -3) {
    score += 8;
    reasons.push("Follow-up due now");
  } else if (daysToFollowUp < -7) {
    score -= 6;
    reasons.push("Going cold (follow-up long overdue)");
  }

  return { score: Math.round(clamp(score, 0, 100)), reasons };
}

/** Hot-lead signals for open inquiries scoring above the threshold, strongest first. */
export function leadSignals(inputs: SignalInputs, minScore = 60): Signal[] {
  const customerById = new Map(inputs.customers.map((c) => [c.id, c]));
  return inputs.inquiries
    .filter((inq) => OPEN_INQUIRY_STAGES.includes(inq.stage) && !inq.convertedOrderId)
    .map((inq) => {
      const customer = customerById.get(inq.customerId);
      const { score, reasons } = scoreInquiry(inq, customer);
      return { inq, customer, score, reasons };
    })
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map(
      ({ inq, customer, score, reasons }): Signal => ({
        id: `SIG-LEAD-${inq.id}`,
        type: "Hot lead",
        severity: severityFromScore(score),
        route: `/sales?inquiryId=${inq.id}`,
        recordId: inq.id,
        score,
        reasons,
        text: `${customer?.name ?? inq.customerId}: ${inq.requirement} — win-score ${score}/100. Prioritise.`,
      }),
    );
}

// ── 2. Follow-up detection ───────────────────────────────────────────────────
// Every open inquiry whose followUpDate has arrived or passed becomes an actionable signal so a
// deal never silently goes cold. Overdue follow-ups escalate in severity with age.

export function followUpSignals(inputs: SignalInputs): Signal[] {
  const customerById = new Map(inputs.customers.map((c) => [c.id, c]));
  return inputs.inquiries
    .filter((inq) => OPEN_INQUIRY_STAGES.includes(inq.stage) && !inq.convertedOrderId)
    .map((inq) => ({ inq, days: daysUntil(inq.followUpDate) }))
    .filter(({ days }) => days <= 0)
    .sort((a, b) => a.days - b.days) // most overdue first
    .map(({ inq, days }): Signal => {
      const overdueBy = -days;
      const severity: Signal["severity"] =
        overdueBy >= 5 ? "High" : overdueBy >= 1 ? "Medium" : "Low";
      const customer = customerById.get(inq.customerId);
      const when =
        overdueBy === 0 ? "due today" : `overdue by ${overdueBy} day${overdueBy === 1 ? "" : "s"}`;
      return {
        id: `SIG-FUP-${inq.id}`,
        type: "Follow-up due",
        severity,
        route: `/sales?inquiryId=${inq.id}`,
        recordId: inq.id,
        text: `Follow-up ${when}: ${customer?.name ?? inq.customerId} — ${inq.nextAction}.`,
      };
    });
}

// ── 3. Repeat-order radar ────────────────────────────────────────────────────
// Existing customers are the cheapest revenue. If a customer with prior orders has gone longer than
// their usual cadence without a new order, surface a nudge to reach out.

export function repeatOrderSignals(
  inputs: SignalInputs,
  cadenceDays = REPEAT_ORDER_CADENCE_DAYS,
): Signal[] {
  const ordersByCustomer = new Map<string, Order[]>();
  for (const order of inputs.orders) {
    const list = ordersByCustomer.get(order.customerId) ?? [];
    list.push(order);
    ordersByCustomer.set(order.customerId, list);
  }

  const signals: Signal[] = [];
  for (const customer of inputs.customers) {
    const orders = ordersByCustomer.get(customer.id);
    if (!orders || orders.length === 0) continue;

    // Days since the most recent order for this customer.
    const lastOrderDays = orders
      .map((o) => -daysUntil(o.createdAt)) // createdAt is in the past → daysUntil negative
      .reduce((min, d) => Math.min(min, d), Number.POSITIVE_INFINITY);

    if (lastOrderDays >= cadenceDays) {
      const severity: Signal["severity"] =
        lastOrderDays >= cadenceDays * 1.5 ? "High" : "Medium";
      signals.push({
        id: `SIG-REP-${customer.id}`,
        type: "Repeat-order due",
        severity,
        route: `/contacts?customerId=${customer.id}`,
        recordId: customer.id,
        text: `${customer.name} last ordered ${lastOrderDays} days ago (usual ~${cadenceDays}). Reach out for a repeat order.`,
      });
    }
  }
  return signals.sort((a, b) => (b.severity === "High" ? 1 : 0) - (a.severity === "High" ? 1 : 0));
}

// ── Aggregate ────────────────────────────────────────────────────────────────

/**
 * All computed sales-acceleration signals, highest severity first. Combine with the seeded
 * operational signals (margin/cash/document) in the service layer.
 */
export function computeSalesSignals(inputs: SignalInputs): Signal[] {
  const severityRank: Record<Signal["severity"], number> = { High: 0, Medium: 1, Low: 2 };
  return [
    ...leadSignals(inputs),
    ...followUpSignals(inputs),
    ...repeatOrderSignals(inputs),
  ].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

/** The signal types this engine produces — handy for filtering computed vs seeded signals. */
export const COMPUTED_SIGNAL_TYPES: ReadonlySet<SignalType> = new Set([
  "Hot lead",
  "Follow-up due",
  "Repeat-order due",
]);
