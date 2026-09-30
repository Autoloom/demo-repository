/**
 * The inspection checklist — a compliance check against the stamped GTP.
 *
 * ── Where this comes from ──────────────────────────────────────────────────────
 * From the 13 Sept call with Niraj: production is made exactly as the customer-stamped GTP, and the
 * inspector tests against THAT GTP and nothing else. If the GTP says 0.8 mm where the IS says 1 mm
 * and the customer stamped it, 0.8 is the requirement and the inspector cannot demand the IS
 * figure. And: "inspection checklist = a GTP compliance check; no separate format needed beyond
 * the GTP parameters." So the checklist is not a second document to keep in step with the GTP — it
 * is the GTP's own parameters, read back as things to verify.
 *
 * ── What is left out, and why ──────────────────────────────────────────────────
 *   • Identity rows (manufacturer, licence number, the standard's name): they are facts about the
 *     document, not properties of a drum.
 *   • IS 10462 intermediate diameters (`lt.calc.*`): the calculation basis the standard uses to
 *     select sheath and armour thicknesses. They exist on no finished cable and cannot be measured.
 *   • Anything the operator hid from the printed GTP: the buyer never saw it, so it cannot be an
 *     acceptance criterion.
 * Every other printed row stays, and each can be marked N/A — a recorded decision, not a blank —
 * because a routine visit does not re-prove a type-tested rating. WHICH rows an inspector actually
 * checks on site is the client's to say; this errs towards listing rather than omitting.
 */
import type { Gtp, InspectionChecklistEntry, InspectionReport, Order } from "../services/types";

export type ChecklistResult = "Pending" | InspectionChecklistEntry["result"];

/** A row the inspector will check. */
export interface ChecklistItem {
  key: string;
  label: string;
  gtpValue: string;
  tolerance: string;
}

/** A row as it is being filled in. */
export interface ChecklistDraftRow extends ChecklistItem {
  measured: string;
  result: ChecklistResult;
}

const EXCLUDED = [/^mfr\./, /^cable\.standard$/, /^cert\.standard$/, /^lt\.calc\./];

export function isInspectable(key: string): boolean {
  return !EXCLUDED.some((pattern) => pattern.test(key));
}

/** The GTP's own parameters, as a list of things to verify. */
export function checklistFromGtp(gtp: Gtp): ChecklistItem[] {
  const hidden = new Set(gtp.hiddenFields ?? []);
  if (gtp.derivedFields && gtp.derivedFields.length > 0) {
    return gtp.derivedFields
      .filter((field) => isInspectable(field.key) && !hidden.has(field.key) && !field.gap)
      .map((field) => ({
        key: field.key,
        label: field.label,
        gtpValue: String(field.value),
        tolerance: field.tolerance?.value ?? "N/A",
      }));
  }
  // An older, section-based record has no derived fields and no tolerances to read back.
  return gtp.sections
    .filter((section) => isInspectable(section.id))
    .map((section) => ({ key: section.id, label: section.label, gtpValue: section.value, tolerance: "N/A" }));
}

export function blankRows(items: ChecklistItem[]): ChecklistDraftRow[] {
  return items.map((item) => ({ ...item, measured: "", result: "Pending" }));
}

export type ChecklistOutcome = "Passed" | "Failed" | "Incomplete";

export interface ChecklistEvaluation {
  outcome: ChecklistOutcome;
  pending: number;
  checked: number;
  /** One line per failed row, in the words a non-conformance report needs. */
  failures: string[];
}

/**
 * Passed only when every row has an answer, none failed, and at least one was actually checked —
 * an inspection where everything is "N/A" has inspected nothing.
 */
export function evaluateChecklist(rows: ChecklistDraftRow[]): ChecklistEvaluation {
  const pending = rows.filter((row) => row.result === "Pending").length;
  const checked = rows.filter((row) => row.result === "Pass" || row.result === "Fail").length;
  const failures = rows
    .filter((row) => row.result === "Fail")
    .map(
      (row) =>
        `${row.label}: measured ${row.measured.trim() || "(not recorded)"}, GTP says ${row.gtpValue}` +
        (row.tolerance !== "N/A" ? ` (${row.tolerance})` : ""),
    );
  const outcome: ChecklistOutcome = pending > 0 || checked === 0 ? "Incomplete" : failures.length > 0 ? "Failed" : "Passed";
  return { outcome, pending, checked, failures };
}

/**
 * Whether an inspection can be recorded against this order at all: it needs the stamped GTP.
 * Inspection is against the approved GTP, so an unstamped one has nothing to be inspected against.
 */
export function inspectionBlockers(gtp: Gtp | undefined): string[] {
  if (!gtp) return ["There is no GTP on this order to inspect against."];
  if (gtp.status !== "Approved") {
    return [`${gtp.id} is ${gtp.status.toLowerCase()} — the inspector tests against the customer-stamped GTP, so it must be approved first.`];
  }
  return [];
}

export interface ReportInput {
  order: Pick<Order, "id">;
  gtp: Gtp;
  rows: ChecklistDraftRow[];
  inspectorName: string;
  inspectorOrg: string;
  /** yyyy-mm-dd */
  inspectedOn: string;
  /** "1, 2, 3" or "DR-7741-A, DR-7741-B" — split on commas. */
  drums: string;
  clearanceIssued: boolean;
  diRef: string;
}

export type ReportResult = { ok: true; report: Omit<InspectionReport, "id"> } | { ok: false; problem: string };

export function buildInspectionReport(input: ReportInput): ReportResult {
  const blockers = inspectionBlockers(input.gtp);
  if (blockers.length > 0) return { ok: false, problem: blockers[0] };
  if (!input.inspectorName.trim()) return { ok: false, problem: "Enter the inspector's name." };
  if (!input.inspectorOrg.trim()) return { ok: false, problem: "Enter who the inspector is from — the board or agency." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.inspectedOn) || Number.isNaN(Date.parse(input.inspectedOn))) {
    return { ok: false, problem: "Enter the date of the inspection." };
  }
  const evaluation = evaluateChecklist(input.rows);
  if (evaluation.outcome === "Incomplete") {
    return {
      ok: false,
      problem:
        evaluation.checked === 0 && evaluation.pending === 0
          ? "Every row is N/A — nothing was actually inspected."
          : `${evaluation.pending} row${evaluation.pending === 1 ? " is" : "s are"} still to be answered. Mark each Pass, Fail or N/A.`,
    };
  }
  const passed = evaluation.outcome === "Passed";
  const drumsChecked = input.drums.split(",").map((drum) => drum.trim()).filter(Boolean);
  return {
    ok: true,
    report: {
      orderId: input.order.id,
      inspectorName: input.inspectorName.trim(),
      inspectorOrg: input.inspectorOrg.trim(),
      inspectedAt: `${input.inspectedOn}T12:00:00+05:30`,
      drumsChecked,
      result: passed ? "Passed" : "Failed",
      nonConformances: passed ? undefined : evaluation.failures,
      // A failed inspection can never carry a dispatch clearance, whatever the box says.
      clearanceIssued: passed && input.clearanceIssued,
      diRef: passed && input.clearanceIssued ? input.diRef.trim() || undefined : undefined,
      gtpId: input.gtp.id,
      gtpVersion: input.gtp.version,
      checklist: input.rows.map((row) => ({
        key: row.key,
        label: row.label,
        gtpValue: row.gtpValue,
        tolerance: row.tolerance,
        measured: row.measured.trim() || undefined,
        result: row.result as InspectionChecklistEntry["result"],
      })),
    },
  };
}

// ── A half-finished inspection is not lost ────────────────────────────────────

/** What is kept of an inspection form that has been started and not yet recorded. */
export interface InspectionDraft {
  rows: { key: string; measured: string; result: ChecklistResult }[];
  inspectorName: string;
  inspectorOrg: string;
  inspectedOn: string;
  drums: string;
  clearance: boolean;
  diRef: string;
}

const VALID_RESULTS: ChecklistResult[] = ["Pending", "Pass", "Fail", "N/A"];

/**
 * The form's rows, with anything previously entered laid back over the GTP's current parameters.
 *
 * Matched by key rather than by position, and only for rows the GTP still has: a checklist is 17
 * to 30 rows filled in over a visit, and closing the panel — or the GTP being edited underneath —
 * must not throw the answers away or attach them to the wrong parameter. An unrecognised answer is
 * dropped to Pending rather than trusted.
 */
export function restoreDraftRows(items: ChecklistItem[], saved: InspectionDraft["rows"] | undefined): ChecklistDraftRow[] {
  const byKey = new Map((saved ?? []).map((row) => [row.key, row]));
  return items.map((item) => {
    const kept = byKey.get(item.key);
    const result = kept && VALID_RESULTS.includes(kept.result) ? kept.result : "Pending";
    return { ...item, measured: kept && typeof kept.measured === "string" ? kept.measured : "", result };
  });
}

/**
 * Mark every row not yet answered as `result`, leaving the answered ones — including every Fail and
 * N/A — exactly as they were. A convenience for the common case of a clean inspection; it does not
 * fill in measurements, and the form still has to be recorded by a person.
 */
export function markUnanswered(rows: ChecklistDraftRow[], result: "Pass"): ChecklistDraftRow[] {
  return rows.map((row) => (row.result === "Pending" ? { ...row, result } : row));
}
