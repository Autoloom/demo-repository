import assert from "node:assert/strict";
import { test } from "node:test";

import { IS8130_2013_TABLE2_STRANDED, findConductor } from "./is8130-2013";
import {
  VERIFIED_WORKS_SIZES, WORKS_CONDUCTORS, WORKS_CONDUCTOR_AL_COMPACTED,
  WORKS_CONDUCTOR_CU_COMPACTED, findWorksConductor, violatesIs8130,
} from "./works-conductor-data";

test("every works construction satisfies its IS 8130 constraints", () => {
  // The bridge invariant. Works data may choose its own dimensions, but it may NOT drop below
  // the Table 2 minimum wire count — that would be a non-conforming conductor on a signed GTP.
  for (const row of WORKS_CONDUCTORS) {
    assert.deepEqual(violatesIs8130(row), [], `${row.material} ${row.csaSqMm} sq mm violates IS 8130`);
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
  for (const row of WORKS_CONDUCTORS.filter((r) => !r.verified)) {
    assert.match(row.origin, /ESTIMATE/, `${row.csaSqMm} sq mm must not look authoritative`);
    assert.doesNotMatch(row.origin, /IS \d/, `${row.csaSqMm} sq mm must not cite a standard it isn't from`);
  }
});

test("no works row claims a standards clause as its origin", () => {
  // The whole point of the split. If a row ever cites "IS 8130, Table 2" as its origin, the
  // provenance separation has been undone.
  for (const row of WORKS_CONDUCTORS) {
    assert.doesNotMatch(row.origin, /IS 8130/, `${row.csaSqMm} sq mm: IS 8130 specifies no dimensions`);
  }
});

test("the resistance a GTP prints still comes from the standard, not from here", () => {
  for (const row of WORKS_CONDUCTORS) {
    assert.ok(!("maxDcResistanceOhmPerKm" in row), `${row.csaSqMm} sq mm: resistance belongs to IS 8130`);
    // ...and the standard must actually have a row for every size we hold works data for.
    assert.ok(findConductor({ csaSqMm: row.csaSqMm, material: row.material, klass: "Class 2" }).maxDcResistanceOhmPerKm > 0);
  }
});

test("both materials are offered, and copper is not a relabelled aluminium row", () => {
  // The manufacturer runs aluminium; the corpus is copper. Rather than pick, we support both —
  // but the two must be genuinely different constructions, not one list with a swapped tag.
  for (const cu of WORKS_CONDUCTOR_CU_COMPACTED) {
    const al = WORKS_CONDUCTOR_AL_COMPACTED.find((r) => r.csaSqMm === cu.csaSqMm);
    if (!al) continue;
    assert.notEqual(cu.conductorDiaMm, al.conductorDiaMm, `${cu.csaSqMm} sq mm: Cu and Al dia identical — suspicious`);
  }
});

test("copper covers every control-cable size, in the form the standard specifies", () => {
  // Control runs 1.5-6 sq mm (cable-types.ts config schema). IS 8130 Table 2 has NO compacted
  // wire count below 10 sq mm — the cell is a dash — so those sizes must be held as circular
  // non-compacted. Holding them as compacted would claim a specification that does not exist.
  for (const csa of [1.5, 2.5, 4, 6]) {
    assert.equal(findWorksConductor(csa, { material: "CU", form: "compacted-or-shaped" }), undefined,
      `${csa} sq mm must not claim a compacted form — IS 8130 does not specify one`);
    const row = findWorksConductor(csa, { material: "CU", form: "circular-non-compacted" });
    assert.ok(row, `no circular copper works row at ${csa} sq mm`);
    assert.deepEqual(violatesIs8130(row), []);
  }
});

test("the compacted/circular split matches where IS 8130 actually has a column", () => {
  for (const row of WORKS_CONDUCTORS) {
    const std = IS8130_2013_TABLE2_STRANDED.find((r) => r.csaSqMm === row.csaSqMm);
    assert.ok(std);
    const compactedMin = row.material === "AL" ? std.minWiresCompactedAl : std.minWiresCompactedCu;
    if (row.form === "compacted-or-shaped") {
      assert.notEqual(compactedMin, null,
        `${row.material} ${row.csaSqMm} sq mm is held compacted but Table 2 has no compacted column for it`);
    }
  }
});

test("no copper row is verified — there is no approved copper GTP to trace to", () => {
  // If this ever fails, someone marked a copper row verified. Check it against a real document
  // before letting it through: the whole value of the flag is that it means something.
  assert.equal(WORKS_CONDUCTOR_CU_COMPACTED.filter((r) => r.verified).length, 0);
  assert.deepEqual(VERIFIED_WORKS_SIZES, [70], "only the KRYFS aluminium row is verified");
});

test("copper wire counts honour the Cu column, which differs from Al", () => {
  // 4 sq mm is the clearest case: IS 8130 Table 2 wants 7 circular wires for copper, 3 for
  // aluminium. A works row that used the Al minimum for a Cu conductor would be non-conforming.
  const cu4 = findWorksConductor(4, { material: "CU", form: "circular-non-compacted" });
  assert.ok(cu4 && cu4.wires >= 7);
  assert.deepEqual(violatesIs8130(cu4), []);
});
