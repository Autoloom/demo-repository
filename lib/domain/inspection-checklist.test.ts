/**
 * The inspection checklist and what recording it does to the board.
 *
 * Driven from a real derived GTP rather than hand-written rows, so a change to what the engine
 * emits — a renamed key, a new intermediate diameter — shows up here as a checklist that changed.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

import { adapter } from "../adapters/mock-adapter";
import { seedData } from "../seed/data";
import { inspectionService, ordersService } from "../services";
import type { Actor, CableStore, Gtp } from "../services/types";
import { buildCard, inspectionCallInfo, transitionBlockers } from "./board";
import {
  blankRows,
  buildInspectionReport,
  checklistFromGtp,
  evaluateChecklist,
  inspectionBlockers,
  isInspectable,
  markUnanswered,
  restoreDraftRows,
  type ChecklistDraftRow,
} from "./inspection-checklist";
import { addDaysIso, inspectionCallBlockers } from "./inspection";
import { inspectionChecklistDocument } from "./inspection-pdf";
import { deriveLtFields } from "./gtp/derive-lt-fields";
import { createPdfBytes } from "./pdf";

const actor: Actor = { id: "test-owner", name: "Test owner", role: "Owner" };
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

/** An approved GTP as the generator saves it: 3½ core × 240, derived fields and all. */
function stampedGtp(patch: Partial<Gtp> = {}): Gtp {
  const base = structuredClone(store.gtps.find((entry) => entry.id === "GTP-001")!);
  return {
    ...base,
    derivedFields: deriveLtFields({ standard: "IS7098-1", csaSqMm: 240, coreCount: 3.5, material: "AL", armoured: true, armourForm: "formed-wire", armourMethod: "A" }),
    hiddenFields: ["lt.armour", "lt.armour.width"],
    version: 2,
    ...patch,
  };
}

const pass = (rows: ChecklistDraftRow[]): ChecklistDraftRow[] => rows.map((row) => ({ ...row, result: "Pass" }));

// ── What is on the checklist ──────────────────────────────────────────────────

test("the checklist is the GTP's own parameters, with the value and tolerance it states", () => {
  const items = checklistFromGtp(stampedGtp());
  const insulation = items.find((item) => item.key === "lt.insulation");
  assert.equal(insulation?.gtpValue, "1.70 mm");
  assert.equal(insulation?.tolerance, "−15.9%");
  assert.equal(items.find((item) => item.key === "lt.overallDia")?.tolerance, "±2%");
  assert.equal(items.find((item) => item.key === "fin.totalMass")?.gtpValue, "4229 kg/km");
  assert.ok(items.length > 15, "a real GTP yields a real checklist");
});

test("identity rows and unmeasurable intermediates are not things to inspect", () => {
  const keys = checklistFromGtp(stampedGtp()).map((item) => item.key);
  for (const key of ["mfr.name", "mfr.isiLicence", "cable.standard", "cert.standard"]) {
    assert.ok(!keys.includes(key), `${key} is a fact about the document, not about a drum`);
  }
  // IS 10462 intermediate diameters exist on no finished cable.
  assert.deepEqual(keys.filter((key) => key.startsWith("lt.calc.")), []);
  assert.equal(isInspectable("lt.calc.dL"), false);
  assert.equal(isInspectable("lt.insulation"), true);
});

test("a parameter the operator hid from the printed GTP is not an acceptance criterion", () => {
  // The buyer never saw it. Armour thickness and width are hidden by default in favour of the
  // single "armour size" row, and the checklist must follow what was actually stamped.
  const keys = checklistFromGtp(stampedGtp()).map((item) => item.key);
  assert.ok(!keys.includes("lt.armour"));
  assert.ok(!keys.includes("lt.armour.width"));
  assert.ok(keys.includes("lt.armourSize"));
  const shown = checklistFromGtp(stampedGtp({ hiddenFields: [] })).map((item) => item.key);
  assert.ok(shown.includes("lt.armour"));
});

test("a hand-added parameter on the GTP is on the checklist too", () => {
  const gtp = stampedGtp();
  gtp.derivedFields = [
    ...gtp.derivedFields!,
    { key: "custom.abc", label: "Tender clause 7.2 — drum marking", value: "Stencilled, 25 mm", tag: "MANUAL", source: "override", trace: "Typed by hand", editable: true },
  ];
  assert.equal(checklistFromGtp(gtp).find((item) => item.key === "custom.abc")?.gtpValue, "Stencilled, 25 mm");
});

test("an older section-based GTP still yields a checklist", () => {
  const legacy = structuredClone(store.gtps.find((entry) => entry.id === "GTP-001")!);
  assert.equal(legacy.derivedFields, undefined);
  const items = checklistFromGtp(legacy);
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.tolerance === "N/A"), "an old record has no tolerances to read back");
});

// ── Evaluating it ─────────────────────────────────────────────────────────────

test("an inspection passes only when every row is answered, none failed, and something was checked", () => {
  const rows = blankRows(checklistFromGtp(stampedGtp()));
  assert.equal(evaluateChecklist(rows).outcome, "Incomplete", "all pending");
  assert.equal(evaluateChecklist(pass(rows)).outcome, "Passed");
  const oneLeft = pass(rows);
  oneLeft[3] = { ...oneLeft[3], result: "Pending" };
  assert.equal(evaluateChecklist(oneLeft).outcome, "Incomplete");
  assert.equal(evaluateChecklist(oneLeft).pending, 1);
});

test("marking everything N/A is not an inspection", () => {
  // N/A is a recorded decision — "not checked this visit" — but an inspection where every row is
  // N/A has inspected nothing, and must not be able to release a shipment.
  const rows = blankRows(checklistFromGtp(stampedGtp())).map((row) => ({ ...row, result: "N/A" as const }));
  assert.equal(evaluateChecklist(rows).outcome, "Incomplete");
  const some = rows.map((row, index) => (index === 0 ? { ...row, result: "Pass" as const } : row));
  assert.equal(evaluateChecklist(some).outcome, "Passed");
});

test("a failed row makes the whole inspection fail, and says what was measured against what", () => {
  const rows = pass(blankRows(checklistFromGtp(stampedGtp())));
  const at = rows.findIndex((row) => row.key === "lt.insulation");
  rows[at] = { ...rows[at], measured: "1.40 mm", result: "Fail" };
  const result = evaluateChecklist(rows);
  assert.equal(result.outcome, "Failed");
  assert.deepEqual(result.failures, ["Insulation thickness (single-core unarmoured / multi-core): measured 1.40 mm, GTP says 1.70 mm (−15.9%)"]);
  // Nothing measured is still reported honestly rather than as a blank.
  rows[at] = { ...rows[at], measured: "  " };
  assert.match(evaluateChecklist(rows).failures[0], /measured \(not recorded\)/);
});

// ── Building the report ───────────────────────────────────────────────────────

function input(overrides: Record<string, unknown> = {}) {
  const gtp = stampedGtp();
  return {
    order: { id: "ORD-7741" },
    gtp,
    rows: pass(blankRows(checklistFromGtp(gtp))),
    inspectorName: "S. Kulkarni",
    inspectorOrg: "MSEDCL",
    inspectedOn: "2026-06-24",
    drums: "DR-7741-A, DR-7741-B",
    clearanceIssued: true,
    diRef: "DI/2026/118",
    ...overrides,
  } as Parameters<typeof buildInspectionReport>[0];
}

test("a complete passing inspection becomes a report that names the GTP it was measured against", () => {
  const result = buildInspectionReport(input());
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.report.result, "Passed");
  assert.equal(result.report.clearanceIssued, true);
  assert.equal(result.report.diRef, "DI/2026/118");
  assert.deepEqual(result.report.drumsChecked, ["DR-7741-A", "DR-7741-B"]);
  // The GTP can be edited later and becomes a new version; "passed" has to say against which.
  assert.equal(result.report.gtpId, "GTP-001");
  assert.equal(result.report.gtpVersion, 2);
  assert.ok((result.report.checklist?.length ?? 0) > 15, "what was checked is kept, row by row");
});

test("a failed inspection can never carry a dispatch clearance, whatever the box says", () => {
  const rows = pass(blankRows(checklistFromGtp(stampedGtp())));
  rows[0] = { ...rows[0], result: "Fail", measured: "wrong" };
  const result = buildInspectionReport(input({ rows, clearanceIssued: true, diRef: "DI/1" }));
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.report.result, "Failed");
  assert.equal(result.report.clearanceIssued, false);
  assert.equal(result.report.diRef, undefined);
  assert.equal(result.report.nonConformances?.length, 1);
});

test("a report needs an inspector, an organisation, a real date and a finished checklist", () => {
  const problem = (overrides: Record<string, unknown>) => {
    const result = buildInspectionReport(input(overrides));
    assert.ok(!result.ok);
    return result.ok ? "" : result.problem;
  };
  assert.match(problem({ inspectorName: "  " }), /inspector's name/);
  assert.match(problem({ inspectorOrg: "" }), /board or agency/);
  assert.match(problem({ inspectedOn: "yesterday" }), /date of the inspection/);
  const pending = pass(blankRows(checklistFromGtp(stampedGtp())));
  pending[0] = { ...pending[0], result: "Pending" };
  pending[1] = { ...pending[1], result: "Pending" };
  assert.match(problem({ rows: pending }), /2 rows are still to be answered/);
  assert.match(problem({ rows: blankRows(checklistFromGtp(stampedGtp())).map((row) => ({ ...row, result: "N/A" as const })) }), /nothing was actually inspected/);
});

test("nothing can be inspected against a GTP that is not stamped", () => {
  assert.equal(inspectionBlockers(stampedGtp()).length, 0);
  assert.match(inspectionBlockers(stampedGtp({ status: "Submitted" }))[0], /Submitted|submitted/);
  assert.match(inspectionBlockers(undefined)[0], /no GTP/);
  const result = buildInspectionReport(input({ gtp: stampedGtp({ status: "Draft" }) }));
  assert.ok(!result.ok);
});

// ── What it does to the board ─────────────────────────────────────────────────

test("recording a passed inspection with clearance opens the dispatch gate, and the card can move", async () => {
  // The order was stuck in production: the gate needs a passed report with clearance and nothing
  // in this build could create one.
  const order = store.orders.find((entry) => entry.id === "ORD-7741")!;
  assert.ok(buildCard(store, order, NOW).nextBlockers.length > 0);
  await assert.rejects(ordersService.transition(order.id, "Ready for Dispatch", actor), /Dispatch is gated/);

  const built = buildInspectionReport(input());
  assert.ok(built.ok);
  if (!built.ok) return;
  await inspectionService.logReport(built.report, actor);

  const after = store.orders.find((entry) => entry.id === "ORD-7741")!;
  assert.deepEqual(buildCard(store, after, NOW).nextBlockers, []);
  assert.equal(transitionBlockers(store, after, "Ready for Dispatch").blockers.length, 0);
  await ordersService.transition(after.id, "Ready for Dispatch", actor);
  assert.equal(store.orders.find((entry) => entry.id === "ORD-7741")!.stage, "Ready for Dispatch");
  assert.equal(buildCard(store, store.orders.find((entry) => entry.id === "ORD-7741")!, NOW).tray.find((item) => item.label === "Inspection")?.state, "ok");
});

test("a passed inspection WITHOUT clearance still does not release the order", async () => {
  const built = buildInspectionReport(input({ clearanceIssued: false }));
  assert.ok(built.ok);
  if (!built.ok) return;
  await inspectionService.logReport(built.report, actor);
  const order = store.orders.find((entry) => entry.id === "ORD-7741")!;
  const card = buildCard(store, order, NOW);
  assert.ok(card.nextBlockers.some((text) => /no dispatch clearance/.test(text)));
  assert.equal(card.tray.find((item) => item.label === "Inspection")?.state, "waiting");
});

test("a failed inspection keeps the order in production and shows as a problem on the card", async () => {
  const rows = pass(blankRows(checklistFromGtp(stampedGtp())));
  rows[2] = { ...rows[2], result: "Fail", measured: "out of tolerance" };
  const built = buildInspectionReport(input({ rows }));
  assert.ok(built.ok);
  if (!built.ok) return;
  await inspectionService.logReport(built.report, actor);
  const order = store.orders.find((entry) => entry.id === "ORD-7741")!;
  const card = buildCard(store, order, NOW);
  assert.equal(order.stage, "In Production");
  assert.equal(card.tray.find((item) => item.label === "Inspection")?.state, "problem");
  assert.ok(card.nextBlockers.some((text) => /failed — re-inspection required/.test(text)));
  await assert.rejects(ordersService.transition(order.id, "Ready for Dispatch", actor), /Dispatch is gated/);
});

// ── Calling the inspector ─────────────────────────────────────────────────────

test("date arithmetic is calendar arithmetic — the same on any machine, across month and year ends", () => {
  // It used to depend on the machine's timezone and came out a day early anywhere west of India.
  assert.equal(addDaysIso("2026-06-28", -10), "2026-06-18");
  assert.equal(addDaysIso("2026-06-23", 11), "2026-07-04");
  assert.equal(addDaysIso("2026-03-01", -1), "2026-02-28");
  assert.equal(addDaysIso("2028-03-01", -1), "2028-02-29", "a leap year");
  assert.equal(addDaysIso("2026-12-25", 10), "2027-01-04");
  assert.equal(addDaysIso("2026-06-28", 0), "2026-06-28");
});

test("the call-by date is ten days before the cable is ready, and the card says when it is late", () => {
  const order = store.orders.find((entry) => entry.id === "ORD-7741")!; // ready 28 June → call by 18 June
  const info = inspectionCallInfo(order, NOW);
  assert.equal(info.callBy, "2026-06-18");
  assert.equal(info.state, "overdue");
  assert.equal(info.days, -5);

  const at = (ready: string) => inspectionCallInfo({ ...order, estimatedCompletionDate: ready }, NOW).state;
  assert.equal(at("2026-07-03"), "due", "call-by 23 June is today");
  assert.equal(at("2026-07-05"), "due", "within three days");
  assert.equal(at("2026-07-20"), "scheduled");
  assert.equal(inspectionCallInfo({ ...order, estimatedCompletionDate: undefined }, NOW).state, "none", "no ready date, no countdown");
});

test("once the call is placed the countdown gives way to the inspector's expected arrival", () => {
  const order = { ...store.orders.find((entry) => entry.id === "ORD-7741")!, inspectionStatus: "Called" as const, inspectorEtaDate: "2026-07-04" };
  assert.deepEqual(inspectionCallInfo(order, NOW), { state: "called", eta: "2026-07-04" });
});

test("the countdown only shows while the cable is being made", () => {
  const won = { ...store.orders.find((entry) => entry.id === "ORD-7741")!, stage: "Won" as const };
  store.orders = [won];
  assert.equal(buildCard(store, won, NOW).inspectionCall.state, "none");
});

test("the call is blocked until every drum's finished-cable test has passed — and the card says so first", async () => {
  // Seeded ORD-7741 has one drum still pending its test.
  const blockers = inspectionCallBlockers(store.finishedCableQc, "ORD-7741");
  assert.equal(blockers.length, 1);
  assert.match(blockers[0], /DR-7741-B/);
  assert.deepEqual(buildCard(store, store.orders.find((entry) => entry.id === "ORD-7741")!, NOW).inspectionCallBlockers, blockers);
  // The service enforces the very same sentence.
  await assert.rejects(inspectionService.placeCall("ORD-7741", actor), (error: Error) => error.message === blockers[0]);
  // An order with no drum tests recorded is not blocked.
  assert.deepEqual(inspectionCallBlockers(store.finishedCableQc, "ORD-7743"), []);
  store.finishedCableQc.find((entry) => entry.id === "FQC-002")!.result = "Pass";
  assert.deepEqual(inspectionCallBlockers(store.finishedCableQc, "ORD-7741"), []);
  await inspectionService.placeCall("ORD-7741", actor);
  assert.equal(store.orders.find((entry) => entry.id === "ORD-7741")!.inspectionStatus, "Called");
});

// ── The document ──────────────────────────────────────────────────────────────

test("the checklist document carries every GTP parameter, its tolerance, and room to write", () => {
  const gtp = stampedGtp({ signOffs: [{ role: "Divisional Engineer", name: "S. Kulkarni", stampedAt: "2026-06-20T10:00:00+05:30" }, { role: "Assistant Engineer", name: "R. Patil", stampedAt: "2026-06-20T11:00:00+05:30" }] });
  const items = checklistFromGtp(gtp);
  const doc = inspectionChecklistDocument({ gtp, orderId: "ORD-7741", customerName: "Shakti Infra Projects", cables: ["3.5Cx240 Al"], items, companyName: "Daksha Cable Industries Pvt Ltd." });
  const text = new TextDecoder("latin1").decode(createPdfBytes(doc)).replace(/\\([()])/g, "$1");

  for (const phrase of ["Inspection checklist", "GTP-001, version 2", "ORD-7741", "Shakti Infra Projects", "S. Kulkarni", "R. Patil", "1.70 mm", "4229 kg/km", "not against the IS value"]) {
    assert.ok(text.includes(phrase), `the checklist must print "${phrase}"`);
  }
  assert.equal(doc.sections[0].table?.rows.length, items.length);
  // The paper offers the same three answers as the form. (Checked on the definition: in a narrow
  // column the printed header wraps onto two lines, so it is not one string in the rendered text.)
  assert.ok(doc.sections[0].table?.headers.includes("Pass / Fail / N/A"));
  assert.ok((doc.sections[0].table?.minRowHeight ?? 0) >= 24, "rows tall enough to write in");
  // The measured and result columns are BLANK on the paper — the inspector fills them in.
  assert.ok((doc.sections[0].table?.rows ?? []).every((row) => row[4] === "" && row[5] === ""));
});

test("an unstamped GTP is stated as such on the sheet rather than implied to be approved", () => {
  const gtp = stampedGtp({ signOffs: [], status: "Draft" });
  const doc = inspectionChecklistDocument({ gtp, orderId: "O", customerName: "C", cables: [], items: [], companyName: "X" });
  assert.ok(JSON.stringify(doc).includes("Not yet stamped"));
});

// ── Not losing a half-finished inspection ─────────────────────────────────────

test("answers already entered are laid back over the GTP's parameters, by key", () => {
  const items = checklistFromGtp(stampedGtp());
  const draft = [
    { key: "lt.insulation", measured: "1.66 mm", result: "Pass" as const },
    { key: "fin.totalMass", measured: "4300", result: "Fail" as const },
  ];
  const rows = restoreDraftRows(items, draft);
  assert.equal(rows.length, items.length);
  assert.deepEqual(rows.find((row) => row.key === "lt.insulation") && [rows.find((row) => row.key === "lt.insulation")!.measured, rows.find((row) => row.key === "lt.insulation")!.result], ["1.66 mm", "Pass"]);
  assert.equal(rows.find((row) => row.key === "fin.totalMass")?.result, "Fail");
  assert.equal(rows.filter((row) => row.result === "Pending").length, items.length - 2);
});

test("a saved answer for a parameter the GTP no longer has is dropped, not attached to another row", () => {
  const items = checklistFromGtp(stampedGtp());
  const rows = restoreDraftRows(items, [{ key: "lt.no-such-row", measured: "x", result: "Pass" }]);
  assert.ok(rows.every((row) => row.result === "Pending" && row.measured === ""));
  assert.equal(rows.length, items.length);
});

test("nothing saved, or garbage saved, gives a clean form", () => {
  const items = checklistFromGtp(stampedGtp());
  assert.ok(restoreDraftRows(items, undefined).every((row) => row.result === "Pending"));
  const rows = restoreDraftRows(items, [{ key: items[0].key, measured: 5 as unknown as string, result: "Definitely" as never }]);
  assert.equal(rows[0].result, "Pending", "an unrecognised answer is never trusted");
  assert.equal(rows[0].measured, "");
});

test("'mark the rest Pass' answers only the unanswered rows and never overrides a Fail or an N/A", () => {
  const rows = blankRows(checklistFromGtp(stampedGtp()));
  rows[0] = { ...rows[0], result: "Fail", measured: "wrong" };
  rows[1] = { ...rows[1], result: "N/A" };
  rows[2] = { ...rows[2], result: "Pass", measured: "ok" };
  const marked = markUnanswered(rows, "Pass");
  assert.equal(marked[0].result, "Fail");
  assert.equal(marked[1].result, "N/A");
  assert.equal(marked[2].measured, "ok");
  assert.ok(marked.slice(3).every((row) => row.result === "Pass" && row.measured === ""), "measurements are never invented");
  // A failure still fails the inspection after the shortcut.
  assert.equal(evaluateChecklist(marked).outcome, "Failed");
});
