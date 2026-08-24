import assert from "node:assert/strict";
import { test } from "node:test";

import {
  IEC62930_CONDUCTOR, IEC62930_SCOPE, SOLAR_MISSING_TABLES, SOLAR_MISSING_VALUES,
  SOLAR_TABLES_HELD, permittedConductorClass, solarInsulationToleranceFloorMm,
  solarSheathToleranceFloorMm,
} from "./iec62930-2017";

test("no dimensional value is encoded while the tables are missing", () => {
  // The guard that matters. If someone later fills these in by inference from the BIS tables,
  // SOLAR_TABLES_HELD must be flipped deliberately and the source named — not slipped in.
  assert.equal(SOLAR_TABLES_HELD, false);
  assert.equal(SOLAR_MISSING_TABLES.length, 3);
  assert.equal(SOLAR_MISSING_VALUES.length, 4);
  for (const t of SOLAR_MISSING_TABLES) {
    assert.ok(t.page >= 13, "the missing tables are on pages 13-14 of the previews");
  }
});

test("solar conductor is tinned copper — not a choice", () => {
  assert.equal(IEC62930_CONDUCTOR.material, "CU");
  assert.equal(IEC62930_CONDUCTOR.tinCoated, true);
});

test("class 5 for module connections, class 2 only for fixed runs", () => {
  assert.equal(permittedConductorClass(true).klass, "Class 5");
  assert.equal(permittedConductorClass(false).klass, "Class 2");
});

test("the 120 °C rating is time-limited, not continuous", () => {
  // Misreading this as a continuous rating would badly over-rate the cable.
  assert.equal(IEC62930_SCOPE.maxContinuousConductorTempC, 90);
  assert.equal(IEC62930_SCOPE.excursionConductorTempC, 120);
  assert.equal(IEC62930_SCOPE.excursionMaxHours, 20000);
});

test("solar tolerance rules differ from the BIS ones and from each other", () => {
  // IEC: 0.9·ts − 0.1 for insulation, 0.85·ts − 0.1 for sheath. Not the BIS formula.
  assert.equal(Number(solarInsulationToleranceFloorMm(1.0).toFixed(3)), 0.8);
  assert.equal(Number(solarSheathToleranceFloorMm(1.0).toFixed(3)), 0.75);
  assert.ok(solarSheathToleranceFloorMm(2.0) < solarInsulationToleranceFloorMm(2.0));
});
