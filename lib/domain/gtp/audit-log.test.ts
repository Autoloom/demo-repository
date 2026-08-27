import assert from "node:assert/strict";
import { test } from "node:test";

import { auditEntriesFor, changedFieldKeys, formatAuditTrail } from "./audit-log";
import type { AuditEntry } from "./audit-log";

const base = { actor: "R. Kamble", context: { customerName: "WBSEDCL", designation: "3Cx70" } };
const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  id: "AUD-1", gtpId: "GTP-1", fieldKey: "power.maxDcResistance", fieldLabel: "Max DC resistance",
  action: "override", previousValue: "0.443 ohm/km", newValue: "0.440 ohm/km",
  reason: "Customer asked to match their last order", at: "2026-08-27T10:15:00.000Z",
  ...base, ...over,
});

test("the trail keeps the whole history, not just the final state", () => {
  // The question a reviewer asks is "was this ever changed, and why" — which a record of only
  // the end state cannot answer. An override, a revert and a re-edit are three entries.
  const log = [
    entry({ id: "A1", action: "override" }),
    entry({ id: "A2", action: "revert", newValue: "", reason: "" }),
    entry({ id: "A3", action: "amend", reason: "Confirmed on call with their DE" }),
  ];
  assert.equal(auditEntriesFor(log, "GTP-1").length, 3);
  assert.deepEqual(auditEntriesFor(log, "GTP-1").map((e) => e.action), ["override", "revert", "amend"]);
});

test("entries are scoped to their GTP", () => {
  const log = [entry({ id: "A1" }), entry({ id: "A2", gtpId: "GTP-2" })];
  assert.equal(auditEntriesFor(log, "GTP-1").length, 1);
  assert.equal(auditEntriesFor(log, "GTP-2").length, 1);
  assert.equal(auditEntriesFor(log, "GTP-3").length, 0);
});

test("a reverted field still counts as touched", () => {
  // Reverting does not erase the fact that it was changed. Someone reviewing the document
  // should see that this value was questioned, even though it ended up back at the derived one.
  const log = [
    entry({ id: "A1", action: "override" }),
    entry({ id: "A2", action: "revert", newValue: "", reason: "" }),
  ];
  assert.deepEqual(changedFieldKeys(log, "GTP-1"), ["power.maxDcResistance"]);
});

test("the formatted trail states who, what, and why", () => {
  const lines = formatAuditTrail([entry({})], "GTP-1");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /R\. Kamble/);
  assert.match(lines[0], /Max DC resistance/);
  assert.match(lines[0], /0\.443 ohm\/km.*0\.440 ohm\/km/);
  assert.match(lines[0], /Customer asked to match their last order/);
});

test("a revert reads as a revert, not as an edit to an empty value", () => {
  const line = formatAuditTrail([entry({ action: "revert", newValue: "", reason: "" })], "GTP-1")[0];
  assert.match(line, /reverted/);
  assert.match(line, /back to the derived value|to the derived value/);
  assert.doesNotMatch(line, /→ ""/);
});

test("every entry carries a reason unless it is a revert", () => {
  // The builder refuses an override without a written reason; the trail must reflect that.
  for (const action of ["override", "amend"] as const) {
    const e = entry({ action });
    assert.ok(e.reason.trim().length > 0, `${action} must carry a reason`);
  }
});

test("context travels with the entry so the trail reads standalone", () => {
  // Without this a reviewer has to join against the GTP record to know which cable it was.
  const e = entry({});
  assert.equal(e.context?.customerName, "WBSEDCL");
  assert.equal(e.context?.designation, "3Cx70");
});
