import assert from "node:assert/strict";
import { test } from "node:test";

import { computeGst, OUR_STATE_CODE } from "./costing";
import { buildCustomer, CUSTOMER_SEGMENTS, GST_STATES, gstinDisagreesWithState } from "./customer";

const valid = {
  name: "  M/s. Avadh Business Services I Pvt. Ltd.  ",
  segment: "EPC contractor" as const,
  contactName: "Madam Zalita",
  phone: "",
  city: "Thane",
  state: "Maharashtra",
  billingAddress: "Building No 2, Kuldevi Kripa A Wing, Thane, Ambernath",
};

test("state codes are unique and match the two-digit prefix of a GSTIN", () => {
  const codes = GST_STATES.map((entry) => entry.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(new Set(GST_STATES.map((entry) => entry.name)).size, GST_STATES.length);
  for (const code of codes) assert.match(code, /^\d{2}$/);
  assert.ok(!codes.includes("25"), "Daman & Diu merged into 26 in 2020");
});

test("the codes the works and its seeded customers actually use are right", () => {
  const code = (name: string) => GST_STATES.find((entry) => entry.name === name)?.code;
  assert.equal(code("Maharashtra"), "27");
  assert.equal(code("Gujarat"), "24");
  assert.equal(code("Karnataka"), "29");
  assert.equal(code("West Bengal"), "19");
  assert.equal(code("Haryana"), "06");
  // …and ours is Maharashtra, which is what makes a Thane buyer intra-state.
  assert.equal(OUR_STATE_CODE, code("Maharashtra"));
});

test("a customer is built from what a works knows, trimmed, with the state code derived", () => {
  const result = buildCustomer(valid, "CUS-NEW", "2026-09-29");
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.customer.name, "M/s. Avadh Business Services I Pvt. Ltd.");
  assert.equal(result.customer.stateCode, "27");
  assert.equal(result.customer.state, "Maharashtra");
  assert.equal(result.customer.gstin, "");
  // Empty where unknown — never a made-up email or credit limit.
  assert.equal(result.customer.email, "");
  assert.equal(result.customer.creditLimitInr, 0);
});

test("a name and a state are required; the state decides tax and is never guessed", () => {
  assert.deepEqual(buildCustomer({ ...valid, name: "   " }, "X", "d"), { ok: false, problem: "Enter the customer's name." });
  const noState = buildCustomer({ ...valid, state: "" }, "X", "d");
  assert.ok(!noState.ok && /state/i.test(noState.problem));
  const unknown = buildCustomer({ ...valid, state: "Atlantis" }, "X", "d");
  assert.ok(!unknown.ok);
});

test("a GSTIN that contradicts the chosen state is caught, because the state sets the tax split", () => {
  assert.equal(gstinDisagreesWithState("24AAALN9999C1Z8", "27"), true);
  assert.equal(gstinDisagreesWithState("27AABCS1234F1Z5", "27"), false);
  assert.equal(gstinDisagreesWithState("", "27"), false, "a GSTIN is optional at offer stage");
  const wrong = buildCustomer({ ...valid, gstin: "24AAALN9999C1Z8" }, "X", "d");
  assert.ok(!wrong.ok && /24/.test(wrong.problem) && /Maharashtra/.test(wrong.problem));
  const right = buildCustomer({ ...valid, gstin: "27aabcs1234f1z5" }, "X", "d");
  assert.ok(right.ok && right.customer.gstin === "27AABCS1234F1Z5", "stored upper-case");
});

test("choosing a Maharashtra customer turns IGST into CGST + SGST — the bug this fixes", () => {
  // With no customer the state code is undefined, which `computeGst` reads as "another state".
  const none = computeGst(100_000, undefined);
  assert.equal(none.interstate, true);
  assert.equal(none.igstInr, 18_000);

  const result = buildCustomer(valid, "CUS-NEW", "2026-09-29");
  assert.ok(result.ok);
  if (!result.ok) return;
  const split = computeGst(100_000, result.customer.stateCode);
  assert.equal(split.interstate, false);
  assert.equal(split.cgstInr, 9_000);
  assert.equal(split.sgstInr, 9_000);
  assert.equal(split.igstInr, undefined);

  const gujarat = buildCustomer({ ...valid, state: "Gujarat" }, "X", "d");
  assert.ok(gujarat.ok && computeGst(100_000, gujarat.customer.stateCode).interstate);
});

test("every segment offered is one the record accepts", () => {
  assert.equal(CUSTOMER_SEGMENTS.length, 7);
  assert.ok(CUSTOMER_SEGMENTS.includes("EPC contractor"));
});
