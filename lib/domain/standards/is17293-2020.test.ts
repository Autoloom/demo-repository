import assert from "node:assert/strict";
import { test } from "node:test";

import { solarInsulationToleranceFloorMm, solarSheathToleranceFloorMm } from "./iec62930-2017";
import {
  IS17293_CLASS2_SIZES, IS17293_CLASS5_SIZES, IS17293_MARKING, IS17293_SCOPE,
  IS17293_TABLE1_CLASS5, IS17293_TABLE2_CLASS2, IS17293_TABLE7_CURRENT,
  conductorClassFor, currentCarryingCapacityA, insulationToleranceFloorMm,
  minimumBendingRadiusMm, sheathToleranceFloorMm, solarDimensions,
} from "./is17293-2020";
import { StandardsLookupError } from "./types";

test("Table 1 spot-checks against the printed page", () => {
  const d = (csa: number) => solarDimensions(csa, "Class 5").values;
  assert.equal(d(1.5).insulationThicknessMm, 0.7);
  assert.equal(d(1.5).sheathThicknessMm, 0.8);
  assert.equal(d(1.5).meanOverallDiaMm, 5.4);
  assert.equal(d(1.5).insulationResistanceAt20CMOhmKm, 1050);
  assert.equal(d(400).insulationThicknessMm, 2.0);
  assert.equal(d(400).meanOverallDiaMm, 40.6);
});

test("Table 2 spot-checks, and it starts at 16 sq mm", () => {
  const d = (csa: number) => solarDimensions(csa, "Class 2").values;
  assert.equal(d(16).meanOverallDiaMm, 9.5);
  assert.equal(d(400).meanOverallDiaMm, 37.7);
  // Class 2 is a FIXED-installation table; there is no 1.5 sq mm row.
  assert.throws(() => solarDimensions(1.5, "Class 2"), StandardsLookupError);
  assert.ok(!IS17293_CLASS2_SIZES.includes(1.5));
  assert.ok(IS17293_CLASS5_SIZES.includes(1.5));
});

test("same thicknesses, different diameters — the two tables are not interchangeable", () => {
  // The distinction that matters: class 5 uses finer wires, so it packs less densely and comes
  // out fatter at the same conductor area. Using Table 1 for a fixed run overstates the cable.
  for (const c2 of IS17293_TABLE2_CLASS2) {
    const c5 = IS17293_TABLE1_CLASS5.find((r) => r.csaSqMm === c2.csaSqMm);
    assert.ok(c5);
    assert.equal(c5.insulationThicknessMm, c2.insulationThicknessMm, `${c2.csaSqMm}: insulation should match`);
    assert.equal(c5.sheathThicknessMm, c2.sheathThicknessMm, `${c2.csaSqMm}: sheath should match`);
    assert.ok(c5.meanOverallDiaMm > c2.meanOverallDiaMm, `${c2.csaSqMm}: class 5 must be fatter`);
  }
});

test("conductor class follows the application, not preference", () => {
  assert.equal(conductorClassFor(true).klass, "Class 5");
  assert.equal(conductorClassFor(false).klass, "Class 2");
});

test("IS 17293 tolerance rules are NOT the IEC ones", () => {
  // The trap when working from both documents. BIS uses an additive rule; IEC a multiplicative.
  // At 1.0 mm they happen to agree; at 2.0 mm they do not.
  assert.equal(Number(insulationToleranceFloorMm(2.0).toFixed(3)), 1.7);
  assert.equal(Number(solarInsulationToleranceFloorMm(2.0).toFixed(3)), 1.7);
  // Sheath is where they diverge: BIS allows a WIDER negative tolerance (0.15, not 0.1).
  assert.equal(Number(sheathToleranceFloorMm(2.0).toFixed(3)), 1.6);
  assert.equal(Number(solarSheathToleranceFloorMm(2.0).toFixed(3)), 1.6);
  assert.equal(Number(sheathToleranceFloorMm(1.0).toFixed(3)), 0.75);
  assert.equal(Number(solarSheathToleranceFloorMm(1.0).toFixed(3)), 0.75);
});

test("the sheath tolerance coefficient differs from the insulation one", () => {
  // §5.3 uses 0.1; §6.3 uses 0.15. Easy to lose, and it changes the acceptance limit.
  assert.notEqual(insulationToleranceFloorMm(2.0), sheathToleranceFloorMm(2.0));
  assert.ok(sheathToleranceFloorMm(2.0) < insulationToleranceFloorMm(2.0), "sheath is allowed to be thinner");
});

test("every table ascends monotonically in dimension", () => {
  for (const [name, table] of [["Table 1", IS17293_TABLE1_CLASS5], ["Table 2", IS17293_TABLE2_CLASS2]] as const) {
    let prevArea = 0;
    let prevDia = 0;
    for (const row of table) {
      assert.ok(row.csaSqMm > prevArea, `${name}: areas must ascend`);
      assert.ok(row.meanOverallDiaMm > prevDia, `${name}: diameter must grow at ${row.csaSqMm}`);
      assert.ok(row.insulationThicknessMm > 0 && row.sheathThicknessMm > 0);
      // The 90 °C figure is exactly 1/1000 of the 20 °C one throughout both tables.
      assert.equal(
        Math.round(row.insulationResistanceAt20CMOhmKm) ,
        Math.round(row.insulationResistanceAt90CMOhmKm * 1000),
        `${name} ${row.csaSqMm}: the two resistance columns should differ by 1000x`,
      );
      prevArea = row.csaSqMm;
      prevDia = row.meanOverallDiaMm;
    }
  }
});

test("current rating must be corrected for ambient — 40 °C is the base, not a safe default", () => {
  const base = currentCarryingCapacityA({ csaSqMm: 4, method: "free-in-air", ambientC: 40 });
  assert.equal(base.amps, 52);
  assert.equal(base.factor, 1.0);

  // India routinely exceeds 40 °C on an array. At 60 °C this is a 22 percent de-rate.
  const hot = currentCarryingCapacityA({ csaSqMm: 4, method: "free-in-air", ambientC: 60 });
  assert.equal(hot.factor, 0.78);
  assert.ok(hot.amps < base.amps);
  assert.equal(hot.amps, Math.round(52 * 0.78 * 10) / 10);
});

test("installation method changes the rating substantially", () => {
  const air = currentCarryingCapacityA({ csaSqMm: 95, method: "free-in-air", ambientC: 40 }).amps;
  const surface = currentCarryingCapacityA({ csaSqMm: 95, method: "on-surface", ambientC: 40 }).amps;
  const touching = currentCarryingCapacityA({ csaSqMm: 95, method: "two-touching", ambientC: 40 }).amps;
  assert.ok(air > surface && surface > touching, "bunching reduces capacity");
  assert.ok(touching / air < 0.8, "two touching cables carry well under 80 percent of free-in-air");
});

test("an unlisted ambient throws rather than interpolating", () => {
  assert.throws(
    () => currentCarryingCapacityA({ csaSqMm: 4, method: "free-in-air", ambientC: 45 }),
    StandardsLookupError,
  );
});

test("current rises with conductor size across the whole table", () => {
  let prev = 0;
  for (const row of IS17293_TABLE7_CURRENT) {
    assert.ok(row.singleFreeInAirA > prev, `current dipped at ${row.csaSqMm} sq mm`);
    assert.ok(row.singleFreeInAirA >= row.singleOnSurfaceA);
    assert.ok(row.singleOnSurfaceA > row.twoTouchingOnSurfaceA);
    prev = row.singleFreeInAirA;
  }
});

test("bending radius scales with diameter and is tighter for careful termination", () => {
  const normal = minimumBendingRadiusMm({ overallDiaMm: 5.4, use: "fixed-normal" });
  const termination = minimumBendingRadiusMm({ overallDiaMm: 5.4, use: "fixed-termination" });
  assert.equal(normal.multiple, 4);
  assert.equal(termination.multiple, 2);
  assert.ok(termination.radiusMm < normal.radiusMm);
  // Above 20 mm the table is open-ended.
  assert.equal(minimumBendingRadiusMm({ overallDiaMm: 40.6, use: "flexible-moving" }).multiple, 6);
});

test("the 120 °C and 250 °C ratings are both time-limited", () => {
  assert.equal(IS17293_SCOPE.maxContinuousConductorTempC, 90);
  assert.equal(IS17293_SCOPE.excursionMaxHours, 20000);
  assert.equal(IS17293_SCOPE.shortCircuitMaxSeconds, 5, "short circuit is 5 SECONDS, not continuous");
  // The cable is rated 1.5 kV but the SYSTEM is capped at 1.8 kV (Annex A-1).
  assert.equal(IS17293_SCOPE.ratedVoltageDcV, 1500);
  assert.equal(IS17293_SCOPE.maxSystemVoltageDcV, 1800);
});

test("IS designation is PV, and the halogen-free legend is mandatory", () => {
  assert.equal(IS17293_MARKING.codeDesignation, "PV");
  assert.equal(IS17293_MARKING.mandatoryLegend, "HALOGEN FREE LOW SMOKE");
  assert.equal(IS17293_MARKING.maxGapBetweenMarksMm, 550);
});
