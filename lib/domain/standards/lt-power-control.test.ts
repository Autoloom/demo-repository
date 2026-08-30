/**
 * IS 7098-1 : 2025, IS 1554-1 : 1988 and the shared protective-covering tables.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  IS1554_1_TABLE2_INSULATION, IS1554_1_TABLE6_ARMOUR_RESISTANCE, armourResistance,
  conductorConstruction as pvcConductorConstruction, pvcInsulationThickness,
  reducedNeutralSize as pvcReducedNeutral,
} from "./is1554-1-1988";
import {
  IS7098_1_TABLE3_INSULATION, IS7098_1_THERMAL, armourCoveragePercent,
  conductorConstruction as xlpeConductorConstruction, reducedNeutralSize, xlpeInsulationThickness,
} from "./is7098-1-2025";
import {
  ARMOUR_TABLE, INNER_SHEATH_TABLE, OUTER_SHEATH_TABLE, armourDimensions, innerSheathThickness,
  insulationToleranceFloorMm, outerSheathThickness,
} from "./protective-coverings";
import { StandardsLookupError, validateBands } from "./types";

test("the three shared tables have no gaps and no overlaps", () => {
  assert.deepEqual(validateBands(INNER_SHEATH_TABLE), []);
  assert.deepEqual(validateBands(ARMOUR_TABLE), []);
  assert.deepEqual(validateBands(OUTER_SHEATH_TABLE), []);
});

test("inner sheath and armour tables are identical across both standards", () => {
  // The shared-schema claim, checked rather than asserted in a comment. If a future edition
  // diverges, encode it per-standard — do not quietly let one standard's values drift.
  for (const dia of [10, 25, 26, 35, 45, 55, 56, 90]) {
    assert.equal(
      innerSheathThickness("IS7098-1", dia).values.minThicknessMm,
      innerSheathThickness("IS1554-1", dia).values.minThicknessMm,
      `inner sheath differs at ${dia} mm`,
    );
  }
  for (const dia of [10, 13, 14, 25, 40, 55, 70, 80]) {
    assert.deepEqual(
      armourDimensions("IS7098-1", dia).values,
      armourDimensions("IS1554-1", dia).values,
      `armour differs at ${dia} mm`,
    );
  }
});

test("each standard cites its OWN table number for the shared data", () => {
  // Same values, different provenance — a GTP against IS 1554-1 must not cite IS 7098-1.
  assert.match(innerSheathThickness("IS7098-1", 30).ref, /IS 7098 \(Part 1\) : 2025, Table 5/);
  assert.match(innerSheathThickness("IS1554-1", 30).ref, /IS 1554 \(Part 1\) : 1988, Table 4/);
  assert.match(armourDimensions("IS7098-1", 30).ref, /IS 7098 \(Part 1\) : 2025, Table 6/);
  assert.match(armourDimensions("IS1554-1", 30).ref, /IS 1554 \(Part 1\) : 1988, Table 5/);
});

test("band boundaries are inclusive-upper, per the standards' own wording", () => {
  // "Over 25 / Up to and including 35" — 25 belongs to the LOWER band. Off-by-one here changes
  // a real sheath thickness, so it is pinned at every boundary.
  assert.equal(innerSheathThickness("IS7098-1", 25).values.minThicknessMm, 0.3);
  assert.equal(innerSheathThickness("IS7098-1", 25.1).values.minThicknessMm, 0.4);
  assert.equal(innerSheathThickness("IS7098-1", 35).values.minThicknessMm, 0.4);
  assert.equal(innerSheathThickness("IS7098-1", 55).values.minThicknessMm, 0.6);
  assert.equal(innerSheathThickness("IS7098-1", 55.1).values.minThicknessMm, 0.7);
});

test("armour: round wire only at or below 13 mm calculated diameter", () => {
  const small = armourDimensions("IS7098-1", 13);
  assert.equal(small.values.roundWireOnly, true);
  assert.equal(small.values.formedWireThicknessMm, null, "no formed-wire option at or below 13 mm");
  assert.equal(small.values.roundWireDiaMm, 1.4);

  const larger = armourDimensions("IS7098-1", 13.5);
  assert.equal(larger.values.roundWireOnly, false);
  assert.equal(larger.values.formedWireThicknessMm, 0.8);
  assert.equal(larger.values.roundWireDiaMm, 1.6);
});

test("armour wire diameter increases monotonically with cable diameter", () => {
  let prev = 0;
  for (const band of ARMOUR_TABLE.bands) {
    assert.ok(band.values.roundWireDiaMm > prev, "armour wire must thicken as the cable grows");
    prev = band.values.roundWireDiaMm;
  }
});

test("outer sheath: armoured minimum equals unarmoured minimum at every band", () => {
  for (const band of OUTER_SHEATH_TABLE.bands) {
    assert.equal(band.values.armouredMinMm, band.values.unarmouredMinMm, "cols 5 and 6 agree in both standards");
    assert.ok(band.values.unarmouredNominalMm > band.values.unarmouredMinMm, "nominal must exceed minimum");
  }
});

test("IS 7098-1:2025 outer-sheath table ENDS at 85 mm; IS 1554-1:1988 does not", () => {
  // A real difference between the two editions, and the one place they must not share behaviour.
  assert.equal(outerSheathThickness("IS7098-1", 85).values.unarmouredNominalMm, 4.0);
  assert.throws(() => outerSheathThickness("IS7098-1", 86), /ends at 85 mm/);
  assert.equal(outerSheathThickness("IS1554-1", 86).values.unarmouredNominalMm, 4.0);
  assert.equal(outerSheathThickness("IS1554-1", 200).values.unarmouredNominalMm, 4.0);
});

test("PVC insulation is thicker than XLPE at every shared size", () => {
  // The material difference that stops these two tables being shared. If this ever inverts,
  // one of the two tables has been transcribed from the wrong standard.
  for (const xlpe of IS7098_1_TABLE3_INSULATION) {
    const pvc = IS1554_1_TABLE2_INSULATION.find((r) => r.csaSqMm === xlpe.csaSqMm);
    if (!pvc) continue;
    assert.ok(
      pvc.unarmouredOrMulticoreMm >= xlpe.unarmouredOrMulticoreMm,
      `${xlpe.csaSqMm} sq mm: PVC (${pvc.unarmouredOrMulticoreMm}) should not be thinner than XLPE (${xlpe.unarmouredOrMulticoreMm})`,
    );
  }
});

test("XLPE runs hotter than PVC — the reason to specify it", () => {
  assert.equal(IS7098_1_THERMAL.maxContinuousConductorTempC, 90);
  assert.equal(IS7098_1_THERMAL.maxShortCircuitConductorTempC, 250);
});

test("the thicker insulation column applies ONLY to single-core armoured cables", () => {
  // The easiest thing to get backwards: a 3-core ARMOURED cable takes the multi-core column.
  assert.equal(xlpeInsulationThickness({ csaSqMm: 300, coreCount: 1, armoured: true }).nominalMm, 2.1);
  assert.equal(xlpeInsulationThickness({ csaSqMm: 300, coreCount: 1, armoured: false }).nominalMm, 1.8);
  assert.equal(xlpeInsulationThickness({ csaSqMm: 300, coreCount: 3, armoured: true }).nominalMm, 1.8);
  assert.equal(xlpeInsulationThickness({ csaSqMm: 300, coreCount: 4, armoured: true }).nominalMm, 1.8);
  // Same rule in IS 1554-1.
  assert.equal(pvcInsulationThickness({ csaSqMm: 300, coreCount: 1, armoured: true }).nominalMm, 2.7);
  assert.equal(pvcInsulationThickness({ csaSqMm: 300, coreCount: 3, armoured: true }).nominalMm, 2.4);
});

test("insulation thickness never decreases as conductor size grows", () => {
  for (const table of [IS7098_1_TABLE3_INSULATION, IS1554_1_TABLE2_INSULATION]) {
    let prevArm = 0;
    let prevMulti = 0;
    for (const row of table) {
      assert.ok(row.singleCoreArmouredMm >= prevArm, `armoured column dips at ${row.csaSqMm}`);
      assert.ok(row.unarmouredOrMulticoreMm >= prevMulti, `multi-core column dips at ${row.csaSqMm}`);
      assert.ok(row.singleCoreArmouredMm > row.unarmouredOrMulticoreMm, `${row.csaSqMm}: columns must differ`);
      prevArm = row.singleCoreArmouredMm;
      prevMulti = row.unarmouredOrMulticoreMm;
    }
  }
});

test("reduced neutral is a LOOKUP, not a ratio", () => {
  // 120 and 150 sq mm both take a 70 sq mm neutral. Any formula would get one of them wrong.
  assert.equal(reducedNeutralSize(120).neutralSqMm, 70);
  assert.equal(reducedNeutralSize(150).neutralSqMm, 70);
  assert.equal(reducedNeutralSize(300).neutralSqMm, 150);
  assert.equal(reducedNeutralSize(25).neutralSqMm, 16);
  assert.equal(reducedNeutralSize(35).neutralSqMm, 16);
  // Both standards agree on these values.
  for (const phase of [25, 50, 95, 240, 630]) {
    assert.equal(reducedNeutralSize(phase).neutralSqMm, pvcReducedNeutral(phase).neutralSqMm);
  }
  // Below 25 sq mm there is no reduced-neutral row at all.
  assert.throws(() => reducedNeutralSize(16), StandardsLookupError);
});

test("conductor construction thresholds differ by material", () => {
  assert.equal(xlpeConductorConstruction(1.5, "AL").form, "solid");
  assert.equal(xlpeConductorConstruction(10, "AL").form, "solid-or-stranded");
  assert.equal(xlpeConductorConstruction(16, "AL").form, "stranded");
  assert.equal(xlpeConductorConstruction(6, "CU").form, "solid-or-stranded");
  assert.equal(xlpeConductorConstruction(10, "CU").form, "stranded");
  // IS 1554-1 uses the same thresholds.
  assert.equal(pvcConductorConstruction(16, "AL").form, "stranded");
  assert.equal(pvcConductorConstruction(10, "CU").form, "stranded");
});

test("Table 6 armour resistance: dashes throw, values fall with size", () => {
  // 1.5 sq mm has round wire only — no strip armour on so small a cable.
  assert.equal(armourResistance({ csaSqMm: 1.5, coreCount: 3, form: "roundWire" }).maxOhmPerKm, 6.02);
  assert.throws(() => armourResistance({ csaSqMm: 1.5, coreCount: 3, form: "strip4x08" }), StandardsLookupError);
  // The heavier 6.1 x 1.4 strip only appears on large cables.
  assert.throws(() => armourResistance({ csaSqMm: 50, coreCount: 3, form: "strip61x14" }), StandardsLookupError);
  assert.equal(armourResistance({ csaSqMm: 240, coreCount: 3, form: "strip61x14" }).maxOhmPerKm, 0.93);
});

test("Table 6 has no row for single-core cables — they are non-magnetic armoured", () => {
  for (const row of IS1554_1_TABLE6_ARMOUR_RESISTANCE) {
    assert.ok(!("singleCore" in row), "Note 1: single-core armour resistance is not covered");
  }
});

test("Annex C armour coverage — 90 percent is the floor", () => {
  // A plausible 3.5C x 300 case: 2.5 mm wires over a 40 mm diameter at a 400 mm lay.
  const coverage = armourCoveragePercent({
    wireCount: 48, wireDiaOrWidthMm: 2.5, diaUnderArmourMm: 40, layLengthMm: 400,
  });
  assert.ok(coverage > 90 && coverage < 130, `coverage ${coverage} should be a plausible percentage`);
  // Halving the wire count must roughly halve coverage — guards the formula's shape.
  const half = armourCoveragePercent({
    wireCount: 24, wireDiaOrWidthMm: 2.5, diaUnderArmourMm: 40, layLengthMm: 400,
  });
  assert.ok(Math.abs(half * 2 - coverage) < 1e-9);
});

test("§10.3 insulation tolerance floor: nominal − (0.1 + 0.1·t)", () => {
  assert.equal(Number(insulationToleranceFloorMm(1.0).toFixed(3)), 0.8);
  assert.equal(Number(insulationToleranceFloorMm(1.8).toFixed(3)), 1.52);
  assert.ok(insulationToleranceFloorMm(2.5) < 2.5);
});

test("an unlisted conductor size throws rather than interpolating", () => {
  assert.throws(() => xlpeInsulationThickness({ csaSqMm: 75, coreCount: 3, armoured: true }), StandardsLookupError);
  assert.throws(() => pvcInsulationThickness({ csaSqMm: 75, coreCount: 3, armoured: true }), StandardsLookupError);
});
