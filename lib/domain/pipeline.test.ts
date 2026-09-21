import assert from "node:assert/strict";
import { beforeEach, afterEach, mock, test } from "node:test";
import { adapter } from "../adapters/mock-adapter";
import { seedData } from "../seed/data";
import { dataService, inquiriesService, ordersService, inspectionService, dispatchService, invoicesService, journeyService } from "../services";
import type { Actor, CableStore, InspectionReport } from "../services/types";
import { dispatchGateBlockers, documentTray, inquirySpecIds, normalizeInquiry, productionGateBlockers } from "./pipeline";

const actor: Actor = { id: "test-owner", name: "Test owner", role: "Owner" };
let store: CableStore;
beforeEach(() => {
  store = structuredClone(seedData);
  mock.method(adapter, "read", async () => structuredClone(store));
  mock.method(adapter, "write", async (next: CableStore) => { store = structuredClone(next); return structuredClone(store); });
});
afterEach(() => mock.restoreAll());

function fixture() {
  const order = store.orders[0];
  const dispatch = store.dispatches.find((item) => item.orderId === order.id)!;
  const invoice = store.invoices.find((item) => item.orderId === order.id)!;
  const job = store.jobCards.find((item) => item.orderId === order.id)!;
  order.stage = "In Production";
  order.completionPct = 60;
  invoice.syncStatus = "Missing dispatch data";
  invoice.status = "Draft";
  store.inspectionReports = [];
  dispatch.checklist.forEach((item) => { item.done = true; });
  return { order, dispatch, invoice, job };
}
function report(orderId: string, patch: Partial<InspectionReport> = {}): InspectionReport {
  return { id: "IR-test", orderId, inspectorName: "Inspector", inspectorOrg: "Board", inspectedAt: "2026-06-23T10:00:00Z", drumsChecked: [], result: "Passed", clearanceIssued: true, ...patch };
}

test("legacy enquiry IDs normalize without overwriting an explicit plural selection", () => {
  assert.deepEqual(inquirySpecIds({ specId: "legacy" }), ["legacy"]);
  assert.deepEqual(inquirySpecIds({ specId: "legacy", specIds: [] }), []);
  assert.deepEqual(inquirySpecIds({ specId: "legacy", specIds: ["a", "b", "a"] }), ["a", "b"]);
  assert.deepEqual(inquirySpecIds({}), []);
});
test("service reads and the next write migrate legacy persisted enquiries without data loss", async () => {
  const inquiry = store.inquiries[0];
  const legacy = { ...inquiry, specId: store.specs[0].id };
  Reflect.deleteProperty(legacy, "specIds");
  store.inquiries[0] = legacy;
  assert.deepEqual((await dataService.read()).inquiries[0].specIds, [legacy.specId]);
  await inquiriesService.updateTitle(inquiry.id, "Updated requirement", actor);
  assert.deepEqual(store.inquiries[0].specIds, [legacy.specId]);
  assert.equal(store.inquiries[0].specId, undefined);
  assert.equal(store.inquiries[0].commercialTerms, inquiry.commercialTerms);
});
test("three-spec enquiry and its commercial terms persist and appear once on the board", async () => {
  const inquiry = await inquiriesService.create({ customerId: store.customers[0].id, requirement: "Three cables for one tender", specIds: store.specs.slice(0, 3).map((spec) => spec.id), source: "Tender portal", estimatedValueInr: 100, followUpDate: "2026-07-01", commercialTerms: "Payment in 30 days" }, actor);
  assert.deepEqual(await inquiriesService.get(inquiry.id), inquiry);
  const board = await inquiriesService.board();
  const jobs = board.filter((item) => item.id === inquiry.id);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].specIds.length, 3);
  assert.equal(jobs[0].commercialTerms, "Payment in 30 days");
  assert.deepEqual(jobs[0].documents.map((item) => item.label), ["Quote", "GTP", "Job card", "Inspection", "Dispatch"]);
  assert.ok(jobs[0].documents.every((item) => item.records.length === 0));
});
test("migration copies IDs rather than mutating persisted input", () => {
  const original = store.inquiries[0];
  const result = normalizeInquiry(original);
  result.specIds.push("another");
  assert.ok(!original.specIds.includes("another"));
});
test("document tray does not attach unrelated jobs when IDs are absent", () => {
  assert.ok(documentTray(store).every((item) => item.records.length === 0));
});
test("document tray resolves quote-only enquiries and all linked quotes", async () => {
  const inquiry = store.inquiries[0];
  store.orders = [];
  const quote = store.quotes.find((item) => item.inquiryId === inquiry.id)!;
  store.quotes.push({ ...quote, id: "Q-second" });
  assert.equal(documentTray(store, inquiry.id)[0].records.length, 2);
  assert.equal((await journeyService.get(inquiry.id)).quote?.id, quote.id);
});

test("production names missing GTP and incoming QC", () => {
  const order = store.orders[0];
  store.gtps = []; store.rawMaterialChecks = [];
  const blockers = productionGateBlockers(store, order);
  assert.equal(blockers.length, 2);
  assert.match(blockers[0], /No GTP/); assert.match(blockers[1], /not been recorded/);
});
test("production requires approval plus nonempty, fully passing raw-material checks", async () => {
  const order = store.orders[0]; order.stage = "Won";
  const gtp = store.gtps.find((item) => item.id === order.gtpId || item.orderId === order.id)!;
  const qc = store.rawMaterialChecks.find((item) => item.orderId === order.id)!;
  gtp.status = "Draft";
  await assert.rejects(ordersService.transition(order.id, "In Production", actor), /sign-off/);
  gtp.status = "Approved";
  for (const result of ["Pending", "Fail"] as const) {
    qc.checks = [{ ...qc.checks[0], result }];
    await assert.rejects(ordersService.transition(order.id, "In Production", actor), /QC/);
  }
  qc.checks = [];
  await assert.rejects(ordersService.transition(order.id, "In Production", actor), /no checks/);
  qc.checks = [{ id: "check", label: "Verified", result: "Pass" }];
  assert.deepEqual(await ordersService.productionBlockers(order.id), []);
  await ordersService.transition(order.id, "In Production", actor);
  assert.equal(store.orders[0].stage, "In Production");
});

for (const scenario of ["missing", "wrong order", "failed", "no clearance", "invalid date"] as const) {
  test(`dispatch blocks ${scenario} evidence`, async () => {
    const { order } = fixture();
    if (scenario !== "missing") store.inspectionReports = [report(scenario === "wrong order" ? "another" : order.id, {
      result: scenario === "failed" ? "Failed" : "Passed", clearanceIssued: scenario !== "no clearance",
      inspectedAt: scenario === "invalid date" ? "bad" : "2026-06-23",
    })];
    assert.ok(dispatchGateBlockers(store, order).length);
    const before = structuredClone(store);
    await assert.rejects(ordersService.transition(order.id, "Ready for Dispatch", actor), /Dispatch is gated/);
    await assert.rejects(ordersService.transition(order.id, "Invoiced", actor), /Dispatch is gated/);
    assert.deepEqual(store, before);
  });
}
test("later failure overrides old clearance, regardless of array order", () => {
  const { order } = fixture();
  const pass = report(order.id);
  const fail = report(order.id, { id: "IR-fail", result: "Failed", inspectedAt: "2026-06-24", clearanceIssued: false });
  for (const reports of [[pass, fail], [fail, pass]]) {
    store.inspectionReports = reports;
    assert.match(dispatchGateBlockers(store, order).join(" "), /IR-fail/);
  }
});
test("equal inspection timestamps use the most recently recorded report", () => {
  const { order } = fixture();
  store.inspectionReports = [report(order.id, { result: "Failed" }), report(order.id)];
  assert.match(dispatchGateBlockers(store, order)[0], /failed/);
});
test("passing clearance allows direct dispatch and does not require optional DI reference", async () => {
  const { order } = fixture(); store.inspectionReports = [report(order.id)];
  await ordersService.transition(order.id, "Ready for Dispatch", actor);
  assert.equal(store.orders[0].stage, "Ready for Dispatch");
});

for (const entryPoint of ["checklist", "certificate", "report"] as const) {
  test(`${entryPoint} handoff cannot advance without applicable inspection clearance`, async () => {
    const { order, dispatch, invoice, job } = fixture();
    const activityCount = store.activity.length;
    if (entryPoint === "checklist") await dispatchService.toggleChecklist(dispatch.id, dispatch.checklist[0].id, true, actor);
    if (entryPoint === "certificate") {
      job.drumPlan = [{ ...job.drumPlan[0], drumNo: "D1", lengthM: 100 }];
      dispatch.drumTestCerts = [{ drumNo: "D1", certRef: "CERT1", verified: false }];
      await dispatchService.setDrumCertVerified(dispatch.id, "D1", true, actor);
      assert.equal(store.dispatches.find((item) => item.id === dispatch.id)?.drumTestCerts[0].verified, true);
    }
    if (entryPoint === "report") {
      // Backdated passing clearance must not mask an already-recorded later failure.
      store.inspectionReports = [report(order.id, { result: "Failed", inspectedAt: "2026-06-24" })];
      await inspectionService.logReport(report(order.id), actor);
      assert.equal(store.inspectionReports.length, 2);
      assert.equal(store.orders[0].inspectionStatus, "Failed");
    }
    assert.equal(store.orders[0].stage, "In Production");
    assert.equal(store.invoices.find((item) => item.id === invoice.id)?.syncStatus, "Missing dispatch data");
    assert.ok(!store.activity.slice(0, store.activity.length - activityCount).some((event) => event.type === "order.ready_for_dispatch" || event.type === "invoice.ready_to_sync"));
  });
  test(`${entryPoint} handoff advances with valid clearance`, async () => {
    const { order, dispatch, invoice, job } = fixture();
    if (entryPoint !== "report") store.inspectionReports = [report(order.id)];
    if (entryPoint === "checklist") await dispatchService.toggleChecklist(dispatch.id, dispatch.checklist[0].id, true, actor);
    if (entryPoint === "certificate") {
      job.drumPlan = [{ ...job.drumPlan[0], drumNo: "D1", lengthM: 100 }];
      dispatch.drumTestCerts = [{ drumNo: "D1", certRef: "CERT1", verified: false }];
      await dispatchService.setDrumCertVerified(dispatch.id, "D1", true, actor);
    }
    if (entryPoint === "report") await inspectionService.logReport(report(order.id), actor);
    assert.equal(store.orders[0].stage, "Ready for Dispatch");
    assert.equal(store.invoices.find((item) => item.id === invoice.id)?.syncStatus, "Ready to sync");
  });
}
test("failed re-inspection revokes a ready handoff and persists the report", async () => {
  const { order, dispatch } = fixture();
  await inspectionService.logReport(report(order.id), actor);
  await inspectionService.logReport(report(order.id, { result: "Failed", clearanceIssued: false, inspectedAt: "2026-06-24" }), actor);
  assert.equal(store.orders[0].stage, "In Production");
  assert.equal(store.inspectionReports.length, 2);
  assert.equal(store.dispatches.find((item) => item.id === dispatch.id)?.checklist.find((item) => item.id === "clearance")?.done, false);
});
test("invoice sync cannot bypass dispatch inspection", async () => {
  const { invoice } = fixture(); invoice.syncStatus = "Ready to sync";
  await assert.rejects(invoicesService.sync(invoice.id, actor), /Dispatch is gated/);
  assert.equal(store.orders[0].stage, "In Production");
});

test("existing enquiry cable selections and terms are editable without losing its job links", async () => {
  const inquiry = store.inquiries[0];
  const before = structuredClone(inquiry);
  const updated = await inquiriesService.updateDetails(inquiry.id, {
    customerId: inquiry.customerId, requirement: inquiry.requirement,
    specIds: store.specs.slice(0, 2).map((spec) => spec.id), commercialTerms: "Delivery in two lots",
    source: inquiry.source, estimatedValueInr: inquiry.estimatedValueInr, followUpDate: inquiry.followUpDate,
  }, actor);
  assert.equal(updated.stage, before.stage);
  assert.equal(updated.convertedOrderId, before.convertedOrderId);
  assert.equal((await inquiriesService.get(inquiry.id))?.commercialTerms, "Delivery in two lots");
  assert.equal((await inquiriesService.get(inquiry.id))?.specIds.length, 2);
});
test("enquiry edits reject unknown specs and changing the customer of a quoted job", async () => {
  const inquiry = store.inquiries[0];
  await assert.rejects(inquiriesService.updateDetails(inquiry.id, { ...inquiry, specIds: ["unknown"] }, actor), /existing cable/);
  await assert.rejects(inquiriesService.updateDetails(inquiry.id, { ...inquiry, customerId: store.customers.find((customer) => customer.id !== inquiry.customerId)!.id }, actor), /cannot change/);
});
test("enquiry mutation permissions are enforced by services", async () => {
  const inquiry = store.inquiries[0];
  const accounts = { ...actor, role: "Accounts" as const };
  await assert.rejects(inquiriesService.updateDetails(inquiry.id, inquiry, accounts), /cannot edit/);
  await assert.rejects(inquiriesService.updateStage(inquiry.id, "Won", accounts), /cannot move/);
  await assert.rejects(inquiriesService.create(inquiry, accounts), /cannot create/);
});
test("a cleared handoff preserves payment holds and is idempotent", async () => {
  const { order, dispatch, invoice } = fixture();
  store.inspectionReports = [report(order.id)];
  invoice.status = "Payment pending";
  invoice.syncStatus = "Synced to Zoho Books";
  store.approvals = [];
  await dispatchService.toggleChecklist(dispatch.id, dispatch.checklist[0].id, true, actor);
  const eventCount = store.activity.filter((event) => event.type === "order.ready_for_dispatch").length;
  await dispatchService.toggleChecklist(dispatch.id, dispatch.checklist[0].id, true, actor);
  assert.equal(store.approvals.filter((approval) => approval.kind === "Dispatch hold").length, 1);
  assert.equal(store.activity.filter((event) => event.type === "order.ready_for_dispatch").length, eventCount);
});
test("inspection date ordering compares instants rather than timezone strings", () => {
  const { order } = fixture();
  store.inspectionReports = [
    report(order.id, { result: "Passed", inspectedAt: "2026-06-24T01:00:00+05:30" }),
    report(order.id, { result: "Failed", inspectedAt: "2026-06-23T21:00:00Z" }),
  ];
  assert.match(dispatchGateBlockers(store, order)[0], /failed/);
});
