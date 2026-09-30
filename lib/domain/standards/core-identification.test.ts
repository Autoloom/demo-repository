import assert from "node:assert/strict";
import { test } from "node:test";

import { CORE_IDENTIFICATION_OPEN_QUESTION, coreIdentification } from "./core-identification";

test("3.5 core is the phases plus a black reduced neutral, per the standard's own two clauses", () => {
  const id = coreIdentification("IS7098-1", 3.5);
  assert.equal(id.method, "colour");
  assert.deepEqual(id.colours, ["Red", "Yellow", "Blue"]);
  assert.equal(id.reducedNeutralColour, "Black");
  // The neutral rule is a SEPARATE clause from the colour table, and the trace must cite both —
  // an inspector checking a black neutral is looking at §11.2, not the colour sequence.
  assert.match(id.ref, /§11\.1\(b\)/);
  assert.match(id.ref, /§11\.2/);
});

test("3 core is red, yellow and BLUE — black is the neutral's colour, not a phase's", () => {
  // Guards the one place the Sept 2026 review disagrees with the standard. If this ever flips to
  // Black, it must be because a human recorded a customer deviation, not because someone
  // "fixed" the table to match the email.
  assert.deepEqual(coreIdentification("IS1554-1", 3).colours, ["Red", "Yellow", "Blue"]);
  assert.deepEqual(coreIdentification("IS7098-1", 3).colours, ["Red", "Yellow", "Blue"]);
  assert.equal(CORE_IDENTIFICATION_OPEN_QUESTION.ours, "Red / Yellow / Blue");
  assert.equal(CORE_IDENTIFICATION_OPEN_QUESTION.theirs, "Red / Yellow / Black");
});

test("two core is red and black, exactly as the review asked", () => {
  assert.deepEqual(coreIdentification("IS1554-1", 2).colours, ["Red", "Black"]);
});

test("the colour sequence grows the way both standards print it", () => {
  assert.deepEqual(coreIdentification("IS1554-1", 4).colours, ["Red", "Yellow", "Blue", "Black"]);
  assert.deepEqual(coreIdentification("IS1554-1", 5).colours, ["Red", "Yellow", "Blue", "Black", "Grey"]);
});

test("above five cores the answer is numbering, not an invented colour list", () => {
  const id = coreIdentification("IS1554-1", 27);
  assert.equal(id.method, "numbered");
  assert.deepEqual(id.colours, []);
  assert.match(id.printed, /numbered 1 to 27/);
  // 50 mm is a real limit from the clause, not decoration.
  assert.match(id.printed, /50 mm/);
  // The standard permits a second approach and the GTP should say so.
  assert.match(id.alternative ?? "", /blue and yellow/);
});

test("the control-cable citation is IS 1554's clause numbering, not IS 7098's", () => {
  // The two books number these clauses differently (§10.x vs §11.x). Citing the wrong one sends
  // an inspector to a clause about something else entirely.
  assert.match(coreIdentification("IS1554-1", 27).ref, /IS 1554 \(Part 1\) : 1988, §10\.3/);
  assert.match(coreIdentification("IS7098-1", 27).ref, /IS 7098 \(Part 1\) : 2025, §11\.3/);
});

test("single core offers the standard's choice rather than silently picking one", () => {
  const id = coreIdentification("IS7098-1", 1);
  assert.match(id.printed, /any one, as ordered/);
  assert.ok(id.colours.includes("Natural"));
});
