import assert from "node:assert/strict";
import { test } from "node:test";

import {
  IS8130_2013_CLASS2_AL_SIZES, IS8130_2013_TABLE1_SOLID, IS8130_2013_TABLE2_STRANDED,
  IS8130_2013_TABLE3_CLASS5, IS8130_2013_TABLE4_CLASS6, IS8130_2013_TABLE5_WELDING_AL,
  correctResistanceTo20C, findConductor, permittedAluminiumGrades, temperatureCorrectionFactor,
} from "./is8130-2013";
import { StandardsLookupError } from "./types";

test("Table 2 aluminium resistances — the AB cable column", () => {
  const al = (csa: number) => findConductor({ csaSqMm: csa, material: "AL", klass: "Class 2" }).maxDcResistanceOhmPerKm;
  assert.equal(al(16), 1.91);
  assert.equal(al(25), 1.2);
  assert.equal(al(35), 0.868);
  assert.equal(al(50), 0.641);
  assert.equal(al(70), 0.443);   // matches the approved KRYFS PKG-30 GTP
  assert.equal(al(95), 0.32);
});

test("120 sq mm aluminium is 0.253 — the value once mistaken for a messenger pairing", () => {
  // The fabricated IS 14255 Table 3 row claimed a 120->70 pairing at 0.253 ohm/km. This is where
  // 0.253 actually comes from: the Table 2 PHASE resistance for 120 sq mm aluminium.
  assert.equal(findConductor({ csaSqMm: 120, material: "AL", klass: "Class 2" }).maxDcResistanceOhmPerKm, 0.253);
});

test("compacted conductors need FEWER wires than circular — a real column distinction", () => {
  const circular = findConductor({ csaSqMm: 70, material: "AL", klass: "Class 2", form: "circular-non-compacted" });
  const compacted = findConductor({ csaSqMm: 70, material: "AL", klass: "Class 2", form: "compacted-or-shaped" });
  assert.equal(circular.minWires, 19);
  assert.equal(compacted.minWires, 12);
  assert.equal(circular.maxDcResistanceOhmPerKm, compacted.maxDcResistanceOhmPerKm, "resistance is form-independent");
});

test("120 and 150 sq mm compacted differ between Cu (18) and Al (15)", () => {
  for (const csa of [120, 150]) {
    assert.equal(findConductor({ csaSqMm: csa, material: "CU", klass: "Class 2", form: "compacted-or-shaped" }).minWires, 18);
    assert.equal(findConductor({ csaSqMm: csa, material: "AL", klass: "Class 2", form: "compacted-or-shaped" }).minWires, 15);
  }
});

test("tinned copper resistance is never lower than plain", () => {
  for (const row of IS8130_2013_TABLE2_STRANDED) {
    if (row.cuPlainOhmPerKm === null || row.cuTinnedOhmPerKm === null) continue;
    assert.ok(row.cuTinnedOhmPerKm >= row.cuPlainOhmPerKm, `${row.csaSqMm} sq mm: tinned < plain`);
  }
});

test("aluminium resistance always exceeds copper for the same size", () => {
  for (const row of IS8130_2013_TABLE2_STRANDED) {
    if (row.alOhmPerKm === null || row.cuPlainOhmPerKm === null) continue;
    assert.ok(row.alOhmPerKm > row.cuPlainOhmPerKm, `${row.csaSqMm} sq mm: Al must be more resistive than Cu`);
  }
});

test("every table's resistance falls monotonically as area grows", () => {
  const check = (rows: ReadonlyArray<{ csaSqMm: number }>, get: (r: never) => number | null | undefined, name: string) => {
    let prev = Infinity;
    for (const row of rows) {
      const v = get(row as never);
      if (v === null || v === undefined) continue;
      assert.ok(v < prev, `${name}: resistance rose at ${row.csaSqMm} sq mm — transcription error`);
      prev = v;
    }
  };
  check(IS8130_2013_TABLE1_SOLID, (r: { cuPlainOhmPerKm: number | null }) => r.cuPlainOhmPerKm, "Table 1 Cu");
  check(IS8130_2013_TABLE1_SOLID, (r: { alOhmPerKm: number | null }) => r.alOhmPerKm, "Table 1 Al");
  check(IS8130_2013_TABLE2_STRANDED, (r: { cuPlainOhmPerKm: number | null }) => r.cuPlainOhmPerKm, "Table 2 Cu");
  check(IS8130_2013_TABLE2_STRANDED, (r: { alOhmPerKm: number | null }) => r.alOhmPerKm, "Table 2 Al");
  check(IS8130_2013_TABLE3_CLASS5, (r: { plainOhmPerKm: number }) => r.plainOhmPerKm, "Table 3");
  check(IS8130_2013_TABLE4_CLASS6, (r: { plainOhmPerKm: number }) => r.plainOhmPerKm, "Table 4");
  check(IS8130_2013_TABLE5_WELDING_AL, (r: { plainOhmPerKm: number }) => r.plainOhmPerKm, "Table 5");
});

test("a dash in the printed table throws — it is 'not specified', not zero", () => {
  // Table 1: no aluminium below 10 sq mm; no plain copper at 185+.
  assert.throws(() => findConductor({ csaSqMm: 6, material: "AL", klass: "Class 1" }), StandardsLookupError);
  assert.throws(() => findConductor({ csaSqMm: 185, material: "CU", klass: "Class 1" }), StandardsLookupError);
  // Table 2: no aluminium at 1 sq mm.
  assert.throws(() => findConductor({ csaSqMm: 1, material: "AL", klass: "Class 2" }), StandardsLookupError);
  // Tinned solid copper stops at 16 sq mm.
  assert.throws(() => findConductor({ csaSqMm: 25, material: "CU", klass: "Class 1", tinned: true }), StandardsLookupError);
});

test("Class 5 and 6 share resistances but Class 6 uses finer wire", () => {
  for (const c6 of IS8130_2013_TABLE4_CLASS6) {
    const c5 = IS8130_2013_TABLE3_CLASS5.find((r) => r.csaSqMm === c6.csaSqMm);
    assert.ok(c5);
    assert.equal(c6.plainOhmPerKm, c5.plainOhmPerKm, `${c6.csaSqMm} sq mm: resistance must match`);
    assert.ok(c6.maxWireDiaMm <= c5.maxWireDiaMm, `${c6.csaSqMm} sq mm: Class 6 wire must not be coarser`);
  }
});

test("flexible classes are copper-only; welding table is aluminium-only", () => {
  assert.throws(() => findConductor({ csaSqMm: 16, material: "AL", klass: "Class 5" }), StandardsLookupError);
  assert.throws(() => findConductor({ csaSqMm: 16, material: "AL", klass: "Class 6" }), StandardsLookupError);
  assert.throws(() => findConductor({ csaSqMm: 25, material: "CU", klass: "Welding Al" }), StandardsLookupError);
  assert.equal(findConductor({ csaSqMm: 25, material: "AL", klass: "Welding Al" }).maxDcResistanceOhmPerKm, 1.23);
});

test("Table 6 correction factors match every printed value, 5-50 C", () => {
  // Transcribed from the printed table to verify the generating formula k_t = 250/(230+t).
  const printed: Record<number, number> = {
    5: 1.064, 6: 1.059, 7: 1.055, 8: 1.050, 9: 1.046, 10: 1.042, 11: 1.037, 12: 1.033,
    13: 1.029, 14: 1.025, 15: 1.020, 16: 1.016, 17: 1.012, 18: 1.008, 19: 1.004, 20: 1.000,
    21: 0.996, 22: 0.992, 23: 0.988, 24: 0.984, 25: 0.980, 26: 0.977, 27: 0.973, 28: 0.969,
    29: 0.965, 30: 0.962, 31: 0.958, 32: 0.954, 33: 0.951, 34: 0.947, 35: 0.943, 36: 0.940,
    37: 0.936, 38: 0.933, 39: 0.929, 40: 0.926, 41: 0.923, 42: 0.919, 43: 0.916, 44: 0.912,
    45: 0.909, 46: 0.906, 47: 0.903, 48: 0.899, 49: 0.896, 50: 0.893,
  };
  for (const [t, expected] of Object.entries(printed)) {
    assert.equal(temperatureCorrectionFactor(Number(t)), expected, `k_t mismatch at ${t} C`);
  }
  assert.equal(temperatureCorrectionFactor(20), 1.0, "20 C is the reference temperature");
});

test("Table 6 is bounded — no extrapolation outside 5-50 C", () => {
  assert.throws(() => temperatureCorrectionFactor(4), StandardsLookupError);
  assert.throws(() => temperatureCorrectionFactor(51), StandardsLookupError);
});

test("§7.3 resistance correction moves the right way", () => {
  // Measured warm reads high, so correcting to 20 C must reduce it.
  assert.ok(correctResistanceTo20C(0.5, 40) < 0.5);
  assert.ok(correctResistanceTo20C(0.5, 10) > 0.5);
  assert.equal(correctResistanceTo20C(0.443, 20), 0.443);
});

test("§4.1 aluminium grade rules", () => {
  assert.deepEqual(permittedAluminiumGrades({ csaSqMm: 6 }).grades, ["H2", "H4"]);
  assert.deepEqual(permittedAluminiumGrades({ csaSqMm: 10 }).grades, ["H2", "H4"], "10 sq mm is inclusive");
  assert.deepEqual(permittedAluminiumGrades({ csaSqMm: 70 }).grades, ["0", "H2", "H4"]);
  assert.deepEqual(permittedAluminiumGrades({ csaSqMm: 70, shapedSolid: true }).grades, ["0"]);
  assert.deepEqual(permittedAluminiumGrades({ csaSqMm: 70, welding: true }).grades, ["0"]);
});

test("the standard specifies NO conductor diameter for Class 1 or 2", () => {
  // The structural fact that invalidated the previous encoding. Table 2 has four data columns:
  // area, min wires, and resistance. If a diameter field ever reappears on a fixed-installation
  // conductor spec, it was invented somewhere and must not be printed as an IS 8130 lookup.
  const spec = findConductor({ csaSqMm: 70, material: "AL", klass: "Class 2", form: "compacted-or-shaped" });
  assert.equal(spec.maxWireDiaMm, undefined, "Class 2 has no wire-diameter column");
  assert.ok(!("compactedDiaMm" in spec));
  assert.ok(!("strandDiaMinMm" in spec));
  assert.ok(!("conductorDiaMm" in spec));
});

test("flexible classes DO carry a max wire diameter, flagged as a maximum", () => {
  const spec = findConductor({ csaSqMm: 70, material: "CU", klass: "Class 5" });
  assert.equal(spec.maxWireDiaMm, 0.51);
  assert.ok(spec.notes.some((n) => /MAXIMUM permitted/.test(n)));
});

test("footnote conditions surface as notes, not silent data", () => {
  const solidCu = findConductor({ csaSqMm: 50, material: "CU", klass: "Class 1" });
  assert.ok(solidCu.notes.some((n) => /not for general purpose|particular cable types/.test(n)));
  const solidAl = findConductor({ csaSqMm: 16, material: "AL", klass: "Class 1" });
  assert.ok(solidAl.notes.some((n) => /circular only/.test(n)));
  const milliken = findConductor({ csaSqMm: 1200, material: "AL", klass: "Class 2" });
  assert.ok(milliken.notes.some((n) => /Milliken/.test(n)));
  assert.equal(milliken.minWires, undefined, "Milliken sizes have no specified wire count");
});

test("the offerable Al size list excludes 1 sq mm and the Milliken sizes", () => {
  assert.ok(!IS8130_2013_CLASS2_AL_SIZES.includes(1), "no aluminium row at 1 sq mm");
  assert.ok(!IS8130_2013_CLASS2_AL_SIZES.includes(1200), "Milliken sizes have no wire count");
  for (const s of [16, 25, 35, 50, 70, 95, 120, 240, 630, 1000]) {
    assert.ok(IS8130_2013_CLASS2_AL_SIZES.includes(s), `${s} sq mm should be offerable`);
  }
});

test("every size in a table appears exactly once", () => {
  for (const [name, rows] of [
    ["Table 1", IS8130_2013_TABLE1_SOLID], ["Table 2", IS8130_2013_TABLE2_STRANDED],
    ["Table 3", IS8130_2013_TABLE3_CLASS5], ["Table 4", IS8130_2013_TABLE4_CLASS6],
    ["Table 5", IS8130_2013_TABLE5_WELDING_AL],
  ] as const) {
    const sizes = rows.map((r) => r.csaSqMm);
    assert.equal(new Set(sizes).size, sizes.length, `${name} has a duplicate size`);
    assert.deepEqual([...sizes].sort((a, b) => a - b), sizes, `${name} is not in ascending order`);
  }
});
