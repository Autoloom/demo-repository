/**
 * The tolerance rules, and the distinctions between them.
 *
 * Four of the seven encoded formulas look identical — `t − (0.1 + 0.1·t)` — and the IEC pair is
 * the same rule algebraically, just written multiplicatively as `0.9·t − 0.1`. That resemblance
 * is a trap, because ONE of the seven is genuinely different: IS 17293 §6.3 uses 0.15 where the
 * adjacent §5.3 uses 0.1, so a sheath tolerance is half again as wide as an insulation one.
 *
 * Anyone tidying this code will be tempted to collapse all seven into a single helper. Doing so
 * would silently widen every solar sheath floor. These tests exist to make that refactor fail
 * loudly rather than ship a cable that passes inspection against the wrong limit.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { insulationToleranceFloorMm as abFloor } from "@/lib/domain/standards/is14255-1995";
import {
  insulationToleranceFloorMm as solarInsulationFloor,
  sheathToleranceFloorMm as solarSheathFloor,
} from "@/lib/domain/standards/is17293-2020";
import {
  solarInsulationToleranceFloorMm as iecInsulationFloor,
  solarSheathToleranceFloorMm as enSheathFloor,
} from "@/lib/domain/standards/iec62930-2017";
import { insulationToleranceFloorMm as ltFloor } from "@/lib/domain/standards/protective-coverings";

import { bandTolerance, floorTolerance, notApplicable, withMandatoryTolerance } from "./tolerance";

/** Floors are compared as printed. Binary floating point makes 2.0 − 0.4 come out at 1.5999…, */
/** which `toFixed(2)` rounds away — so exact equality would fail on arithmetic, not on meaning. */
const at = (mm: number) => mm.toFixed(2);

test("insulation and sheath rules disagree, and must keep disagreeing", () => {
  // One nominal, so the only thing that can differ is the rule. All three insulation clauses
  // agree at 1.70; the sheath clause does not, because §6.3 uses 0.15 where §5.3 uses 0.1.
  const t = 2.0;
  assert.equal(at(abFloor(t)), "1.70"); // IS 14255 §7.3
  assert.equal(at(ltFloor(t)), "1.70"); // IS 7098-1 §10.3 / IS 1554-1 §9.3
  assert.equal(at(solarInsulationFloor(t)), "1.70"); // IS 17293 §5.3

  assert.equal(at(solarSheathFloor(t)), "1.60"); // IS 17293 §6.3
  assert.notEqual(
    at(solarSheathFloor(t)),
    at(solarInsulationFloor(t)),
    "§6.3 has been collapsed into §5.3 — every solar sheath tolerance is now 50% too wide",
  );
});

test("the sheath rules stay apart from the insulation rules across the size range", () => {
  // A single test point can coincide by accident. Sweeping the range proves the gap is the rule,
  // not an artefact of one nominal — and that the gap widens with thickness, as 0.15 vs 0.1 must.
  let previousGap = 0;
  for (const t of [1.0, 2.0, 3.0, 4.0]) {
    const gap = solarInsulationFloor(t) - solarSheathFloor(t);
    assert.ok(gap > 0, `at ${t} mm the sheath floor is not below the insulation floor`);
    assert.ok(gap > previousGap, `the 0.05·t gap did not widen between nominals`);
    previousGap = gap;
  }
});

test("the IS additive form and the IEC multiplicative form are the same rule written twice", () => {
  // t − (0.1 + 0.1·t) expands to 0.9·t − 0.1, and t − (0.1 + 0.15·t) to 0.85·t − 0.1. The two
  // standards word their tolerance differently but specify identical limits. Worth pinning: if
  // a future edit "corrects" one of them, this test says which of the two actually moved.
  //
  // Compared numerically, not as printed strings. The forms are algebraically identical but not
  // bit-identical — at 1.5 mm one lands on 1.175 and the other on 1.1750000000000003, which
  // `toFixed(2)` rounds to 1.17 and 1.18. That is a property of binary floating point, not a
  // disagreement between the standards, and asserting on the printed form would fake a conflict.
  for (const t of [1.0, 1.5, 2.0, 3.0, 4.0]) {
    assert.ok(
      Math.abs(abFloor(t) - iecInsulationFloor(t)) < 1e-9,
      `insulation forms diverged at ${t}: ${abFloor(t)} vs ${iecInsulationFloor(t)}`,
    );
    assert.ok(
      Math.abs(solarSheathFloor(t) - enSheathFloor(t)) < 1e-9,
      `sheath forms diverged at ${t}: ${solarSheathFloor(t)} vs ${enSheathFloor(t)}`,
    );
  }
});

test("a floor is always below the nominal it qualifies", () => {
  for (const t of [0.7, 1.0, 1.2, 1.5, 1.8, 2.0, 2.4, 3.0, 4.0]) {
    for (const rule of [abFloor, ltFloor, solarInsulationFloor, solarSheathFloor]) {
      const floor = rule(t);
      assert.ok(floor < t, `floor ${floor} is not below nominal ${t}`);
      assert.ok(floor > 0, `floor ${floor} is not a usable thickness`);
    }
  }
});

test("floorTolerance prints a one-sided percentage and keeps the millimetre floor in the trace", () => {
  // 1.50 nominal, 1.25 floor → 0.25/1.50 = 16.7% low, with no upper limit.
  const tol = floorTolerance(1.5, 1.25, "IS 14255 : 1995, §7.3 — worked example");
  assert.equal(tol.value, "−16.7%");
  assert.equal(tol.origin, "is-rule");
  assert.ok(!tol.value.includes("±"), "a one-sided limit must not print as a symmetric band");
  // The absolute limit is what an inspector measures against, so it must stay recoverable.
  assert.match(tol.trace, /1\.25 mm min at any point/);
});

test("the percentage tracks the nominal, because the underlying rule is absolute", () => {
  // t − (0.1 + 0.1·t): the fixed 0.1 mm term dominates at small thicknesses, so a thin wall
  // tolerates proportionally more. A single blanket percentage would be wrong at both ends.
  assert.equal(floorTolerance(0.7, 0.53, "x").value, "−24.3%");
  assert.equal(floorTolerance(1.5, 1.25, "x").value, "−16.7%");
  assert.equal(floorTolerance(4.0, 3.5, "x").value, "−12.5%");
});

test("a zero nominal cannot produce an Infinity percentage", () => {
  // No encoded row has a zero nominal, but a future table might, and "−Infinity%" would reach
  // the printed document without anything else noticing.
  assert.equal(floorTolerance(0, 0, "x").value, "−0.0%");
});

test("notApplicable states an answer, not an absence", () => {
  const na = notApplicable("Already a maximum — IS 8130 §3.2");
  assert.equal(na.value, "N/A");
  assert.equal(na.origin, "not-applicable");
  assert.match(na.trace, /IS 8130/);
});

test("withMandatoryTolerance fills gaps but never overwrites a real answer", () => {
  const filled = withMandatoryTolerance([
    { key: "a", label: "A", value: "1", tag: "FIXED", source: "profile", trace: "t", editable: false },
    { key: "b", label: "B", value: "2", tag: "FIXED", source: "profile", trace: "t", editable: false,
      tolerance: floorTolerance(1.5, 1.25, "IS 14255 : 1995, §7.3") },
  ]);
  assert.equal(filled[0].tolerance?.origin, "not-applicable");
  assert.equal(filled[1].tolerance?.value, "−16.7%", "an existing tolerance was clobbered");
});

test("a band cannot be labelled a standards rule", () => {
  // `bandTolerance` excludes "is-rule" at the type level; this pins the runtime behaviour too.
  // Every band in the system is a works spread or a commercial term, and none is an IS limit.
  assert.equal(bandTolerance("±3%", "works-estimate", "works spread").origin, "works-estimate");
  assert.equal(bandTolerance("±5%", "customer", "agreed with buyer").origin, "customer");
});
