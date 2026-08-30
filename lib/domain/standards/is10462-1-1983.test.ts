import assert from "node:assert/strict";
import { test } from "node:test";

import {
  IS10462_TABLE1_FIXED, IS10462_TABLE2_FLEXIBLE, IS10462_TABLE3_ASSEMBLY, IS10462_TABLE3_ONE_LAYER,
  assemblyCoefficient, fictitiousChain, fictitiousConductorDiameter, fictitiousCoreDiameter,
  fictitiousLaidUpDiameter, fictitiousOverArmour, fictitiousOverInnerSheath, roundToTenth,
} from "./is10462-1-1983";
import { StandardsLookupError } from "./types";

test("Table 1 spot-checks against the printed page", () => {
  assert.equal(fictitiousConductorDiameter(1.5), 1.4);
  assert.equal(fictitiousConductorDiameter(70), 9.4);
  assert.equal(fictitiousConductorDiameter(95), 11.0);
  assert.equal(fictitiousConductorDiameter(1000), 35.7);
});

test("Table 2 is a DIFFERENT table — flexible must never fall back to fixed", () => {
  assert.equal(fictitiousConductorDiameter(70, "flexible"), 12.4);   // vs 9.4 fixed
  assert.equal(fictitiousConductorDiameter(16, "flexible"), 5.7);    // vs 4.5 fixed
  // 0.5 exists only in Table 2; 1000 only in Table 1. Each must reject the other's size.
  assert.throws(() => fictitiousConductorDiameter(0.5, "fixed"), StandardsLookupError);
  assert.throws(() => fictitiousConductorDiameter(1000, "flexible"), StandardsLookupError);
});

test("both conductor tables ascend monotonically", () => {
  for (const table of [IS10462_TABLE1_FIXED, IS10462_TABLE2_FLEXIBLE]) {
    for (let i = 1; i < table.length; i++) {
      assert.ok(table[i].csaSqMm > table[i - 1].csaSqMm, "areas must ascend");
      assert.ok(table[i].dLMm > table[i - 1].dLMm, `d_L must ascend at ${table[i].csaSqMm}`);
    }
  }
});

test("an unlisted area throws rather than interpolating", () => {
  // Inventing a row is how a fabricated value reached IS 14255 earlier. Never interpolate.
  assert.throws(() => fictitiousConductorDiameter(2.0), StandardsLookupError);
  assert.throws(() => fictitiousConductorDiameter(75), StandardsLookupError);
});

test("Table 3 assembly coefficients, including the non-monotonic plateaus", () => {
  assert.equal(assemblyCoefficient(2), 2.0);
  assert.equal(assemblyCoefficient(3), 2.16);
  assert.equal(assemblyCoefficient(4), 2.42);
  assert.equal(assemblyCoefficient(61), 9.0);
  // The table genuinely repeats k across runs of core counts — 6 and 7 both 3.00; 24/25/26 all 6.00.
  assert.equal(assemblyCoefficient(6), assemblyCoefficient(7));
  assert.equal(assemblyCoefficient(24), 6.0);
  assert.equal(assemblyCoefficient(26), 6.0);
  assert.equal(assemblyCoefficient(34), assemblyCoefficient(37));
});

test("starred 'one layer' rows are a separate arrangement, not a replacement", () => {
  for (const cores of Object.keys(IS10462_TABLE3_ONE_LAYER).map(Number)) {
    assert.notEqual(
      assemblyCoefficient(cores, true), assemblyCoefficient(cores, false),
      `${cores} cores: one-layer k must differ from multi-layer k`,
    );
  }
  assert.equal(assemblyCoefficient(7, true), 3.35);
  assert.equal(assemblyCoefficient(7, false), 3.0);
  // One-layer exists for only six core counts; anything else is a caller error.
  assert.throws(() => assemblyCoefficient(3, true), StandardsLookupError);
});

test("Table 3 is never decreasing as cores increase", () => {
  const cores = Object.keys(IS10462_TABLE3_ASSEMBLY).map(Number).sort((a, b) => a - b);
  for (let i = 1; i < cores.length; i++) {
    assert.ok(
      IS10462_TABLE3_ASSEMBLY[cores[i]] >= IS10462_TABLE3_ASSEMBLY[cores[i - 1]],
      `k dropped between ${cores[i - 1]} and ${cores[i]} cores — transcription error`,
    );
  }
});

test("§0.7 rounds to 0.1 mm, half away from zero, float-error tolerant", () => {
  assert.equal(roundToTenth(9.44), 9.4);
  assert.equal(roundToTenth(9.45), 9.5);
  assert.equal(roundToTenth(8.25), 8.3);   // binary float stores 8.25 low; must not give 8.2
  assert.equal(roundToTenth(20.304), 20.3);
});

test("§0.7 — rounding AT EACH STAGE, not once at the end", () => {
  // The trap. 25 sq mm, 3 core, t1 = 0.9:
  //   staged: D_c = round(5.6 + 1.8) = 7.4       → D_f = round(2.16 × 7.4)  = 16.0
  //   naive : D_f = round(2.16 × (5.6 + 1.8))    = round(15.984)            = 16.0  (agrees)
  // so pick a case where they diverge: t1 = 0.93 →
  //   staged: D_c = round(7.46) = 7.5            → D_f = round(2.16 × 7.5)  = 16.2
  //   naive : round(2.16 × 7.46) = round(16.113) = 16.1                     ← differs
  const dL = fictitiousConductorDiameter(25);
  const staged = fictitiousLaidUpDiameter({
    form: "uniform", cores: 3, dCMm: fictitiousCoreDiameter({ dLMm: dL, insulationThicknessMm: 0.93 }),
  });
  const naive = roundToTenth(2.16 * (dL + 2 * 0.93));
  assert.equal(staged, 16.2);
  assert.equal(naive, 16.1);
  assert.notEqual(staged, naive, "if these ever agree this test has stopped guarding §0.7");
});

test("§3.2 screening adds exactly 3.0 mm, and only when screened", () => {
  const unscreened = fictitiousCoreDiameter({ dLMm: 9.4, insulationThicknessMm: 1.1 });
  const screened = fictitiousCoreDiameter({ dLMm: 9.4, insulationThicknessMm: 1.1, screened: true });
  assert.equal(unscreened, 11.6);
  assert.equal(screened, 14.6);
});

test("§3.3(b) 3½-core uses its own formula with the embedded 2.42", () => {
  // 2.42 × (3×11.6 + 9.9) / 4 = 2.42 × 44.7 / 4 = 27.0435 → 27.0
  assert.equal(fictitiousLaidUpDiameter({ form: "threeAndHalf", fullCoreDMm: 11.6, halfCoreDMm: 9.9 }), 27.0);
});

test("§3.3(c) cradle separator is k(D_c + 2.5) − 2.5, not k·D_c", () => {
  const plain = fictitiousLaidUpDiameter({ form: "uniform", cores: 4, dCMm: 11.6 });
  const cradle = fictitiousLaidUpDiameter({ form: "cradleSeparator", cores: 4, dCMm: 11.6 });
  assert.equal(plain, 28.1);                       // 2.42 × 11.6 = 28.072
  assert.equal(cradle, 31.6);                      // 2.42 × 14.1 − 2.5 = 31.622
  assert.ok(cradle > plain, "a separator can only make the bundle larger");
});

test("§3.4 / §3.5 add two thicknesses, and pliable armour counts 3× the wire", () => {
  assert.equal(fictitiousOverInnerSheath(28.1, 0.4), 28.9);
  assert.equal(fictitiousOverArmour(28.9, 1.4), 31.7);
  assert.equal(fictitiousOverArmour(28.9, 1.4, true), 37.3);   // t_A = 3 × 1.4 = 4.2
});

test("the full chain traces every intermediate with its clause reference", () => {
  const r = fictitiousChain({
    csaSqMm: 70, cores: 3, insulationThicknessMm: 1.1,
    innerSheathThicknessMm: 0.4, armour: { wireDiaOrStripThicknessMm: 1.4 },
  });
  assert.deepEqual(
    [r.dLMm, r.dCMm, r.dFMm, r.dBMm, r.dXMm],
    [9.4, 11.6, 25.1, 25.9, 28.7],
  );
  assert.equal(r.steps.length, 5);
  for (const s of r.steps) assert.match(s.ref, /IS 10462 \(Part 1\) : 1983/);
});

test("the chain stops cleanly when there is no inner sheath or armour", () => {
  const bare = fictitiousChain({ csaSqMm: 70, cores: 3, insulationThicknessMm: 1.1 });
  assert.equal(bare.dBMm, undefined);
  assert.equal(bare.dXMm, undefined);
  assert.equal(bare.steps.length, 3);
});

test("fictitious diameter is NOT the real diameter — §0.4", () => {
  // Guard against the classic conflation. The real compacted 70 sq mm Al conductor measures
  // 9.44 mm (IS 8130 / KRYFS GTP); the fictitious value is 9.4 and is a table key only.
  assert.equal(fictitiousConductorDiameter(70), 9.4);
  assert.notEqual(fictitiousConductorDiameter(70), 9.44);
});
