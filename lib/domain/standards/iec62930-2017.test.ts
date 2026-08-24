import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EN50618_CONDUCTOR_RESISTANCE, IEC62930_CONDUCTOR, IEC62930_SCOPE, SOLAR_MISSING_TABLES,
  SOLAR_MISSING_VALUES, SOLAR_TABLES_HELD, SOLAR_UNREAD_CLAUSES, permittedConductorClass,
  solarInsulationToleranceFloorMm, solarSheathToleranceFloorMm,
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

test("clauses we have not read are listed, not guessed at", () => {
  // §5.4 "Multi-core cables and additional elements" is on page 11 and absent from the extract.
  // An earlier version of this module asserted it excluded multi-core cable — an inference from
  // the TITLE alone. Unread clauses are now recorded as unread.
  assert.ok(SOLAR_UNREAD_CLAUSES.length >= 4);
  const multicore = SOLAR_UNREAD_CLAUSES.find((c) => c.clause === "§5.4");
  assert.ok(multicore, "the multi-core clause must be listed as unread");
  assert.equal(multicore.page, 11);
});

test("conductor resistance is deferred to IEC 60228, which we do not hold", () => {
  // EN 50618 §5.1.5 specifies no values of its own — it points at the metal-coated class 5
  // column of IEC 60228. IS 8130 derives from IEC 60228 but is not a substitute for it.
  assert.equal(EN50618_CONDUCTOR_RESISTANCE.heldLocally, false);
  assert.match(EN50618_CONDUCTOR_RESISTANCE.perStandard, /metal-coated Class 5/i);
});
