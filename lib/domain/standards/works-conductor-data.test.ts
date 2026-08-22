import assert from "node:assert/strict";
import { test } from "node:test";

import { findConductor } from "./is8130-2013";
import {
  VERIFIED_WORKS_SIZES, WORKS_CONDUCTOR_AL_COMPACTED, findWorksConductor, violatesIs8130,
} from "./works-conductor-data";

test("every works construction satisfies its IS 8130 constraints", () => {
  // The bridge invariant. Works data may choose its own dimensions, but it may NOT drop below
  // the Table 2 minimum wire count — that would be a non-conforming conductor on a signed GTP.
  for (const row of WORKS_CONDUCTOR_AL_COMPACTED) {
    assert.deepEqual(violatesIs8130(row), [], `${row.csaSqMm} sq mm violates IS 8130`);
  }
});

test("violatesIs8130 actually catches an under-stranded conductor", () => {
  // Guard the guard: 70 sq mm compacted Al needs >= 12 wires per Table 2.
  const bad = { ...WORKS_CONDUCTOR_AL_COMPACTED.find((r) => r.csaSqMm === 70)!, wires: 7 };
  const problems = violatesIs8130(bad);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /below the IS 8130 Table 2 minimum of 12/);
});

test("only the KRYFS-traceable row is marked verified", () => {
  assert.deepEqual(VERIFIED_WORKS_SIZES, [70]);
  const kryfs = findWorksConductor(70);
  assert.ok(kryfs?.verified);
  assert.match(kryfs.origin, /KRYFS/);
  assert.equal(kryfs.wires, 19);
  assert.equal(kryfs.wireDiaMm, 2.17);
  assert.equal(kryfs.conductorDiaMm, 9.44);
  assert.equal(kryfs.massKgPerKm, 196);
});

test("unverified rows say plainly that they are estimates", () => {
  for (const row of WORKS_CONDUCTOR_AL_COMPACTED.filter((r) => !r.verified)) {
    assert.match(row.origin, /ESTIMATE/, `${row.csaSqMm} sq mm must not look authoritative`);
    assert.doesNotMatch(row.origin, /IS \d/, `${row.csaSqMm} sq mm must not cite a standard it isn't from`);
  }
});

test("no works row claims a standards clause as its origin", () => {
  // The whole point of the split. If a row ever cites "IS 8130, Table 2" as its origin, the
  // provenance separation has been undone.
  for (const row of WORKS_CONDUCTOR_AL_COMPACTED) {
    assert.doesNotMatch(row.origin, /IS 8130/, `${row.csaSqMm} sq mm: IS 8130 specifies no dimensions`);
  }
});

test("the resistance a GTP prints still comes from the standard, not from here", () => {
  for (const row of WORKS_CONDUCTOR_AL_COMPACTED) {
    assert.ok(!("maxDcResistanceOhmPerKm" in row), `${row.csaSqMm} sq mm: resistance belongs to IS 8130`);
    // ...and the standard must actually have a row for every size we hold works data for.
    assert.ok(findConductor({ csaSqMm: row.csaSqMm, material: "AL", klass: "Class 2" }).maxDcResistanceOhmPerKm > 0);
  }
});
