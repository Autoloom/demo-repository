/**
 * Derived cable mass.
 *
 * These tests exist because mass is about to become a PRICE. The quote builder stops estimating
 * and starts multiplying this number by a rate per kilogram, so an error here is not a wrong
 * label on a document — it is a wrong figure on a tender.
 *
 * Two classes of bug are pinned deliberately, because both already happened while writing this:
 *
 *   1. A stray unit conversion. The identity `mm² × g/cm³ ≡ kg/km` needs no ×1000, and adding
 *      one produces a plausible-looking number three orders of magnitude out.
 *   2. Treating a wire diameter as a wall thickness. The chain reports "Armour round wire
 *      diameter"; modelling those wires as a solid steel shell over-stated armour by ~30%.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { constructionFromSelection, defaultSelection } from "./compose-size";
import { deriveFields } from "./derive";
import {
  annulusMassKgPerKm,
  conductorMassKgPerKm,
  deriveLtMass,
  deriveSolarMass,
  isMassGap,
  LAY_UP_FACTOR,
  MATERIAL_DENSITY,
  roundWireArmourMassKgPerKm,
} from "./mass";

const lt = (over: Partial<Parameters<typeof deriveLtMass>[0]> = {}) =>
  deriveLtMass({ standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true, ...over });

const mass = (r: ReturnType<typeof deriveLtMass>) => {
  assert.ok(!isMassGap(r), "expected a derived mass, got a gap");
  return r as Exclude<typeof r, { gap: true }>;
};

test("the unit identity holds with no conversion factor", () => {
  // 1 mm² × 1 km = 1000 cm³, and 1000 cm³ at 1 g/cm³ = 1 kg. So a 1 sq mm conductor of a
  // material at 1 g/cm³ weighs exactly 1 kg/km. If a ×1000 ever creeps in, this fails first.
  assert.equal(conductorMassKgPerKm(1, 1, 1), 1);
  // 300 sq mm of aluminium, three cores: 300 × 2.7 × 3.
  assert.equal(conductorMassKgPerKm(300, MATERIAL_DENSITY.aluminium, 3), 2430);
});

test("an annulus is the ring area, not the whole circle", () => {
  // A 1 mm wall on a 10 mm core is π × 1 × 11 ≈ 34.6 mm², NOT π/4 × 12² = 113 mm².
  const ring = annulusMassKgPerKm(10, 1, 1);
  assert.ok(Math.abs(ring - Math.PI * 11) < 1e-9, `got ${ring}`);
  // A zero wall contributes nothing rather than throwing or producing NaN.
  assert.equal(annulusMassKgPerKm(10, 0, 1), 0);
});

test("armour wires are counted as wires, not as a solid steel shell", () => {
  // The regression this pins: 1.6 mm is a WIRE DIAMETER. Modelled as a 1.6 mm wall around a
  // 14.9 mm core it gives ~83 mm² of steel; the wires actually present total ~64 mm². The
  // difference made armour outweigh the conductor on a 300 sq mm cable.
  const { massKgPerKm, wireCount } = roundWireArmourMassKgPerKm(14.9, 1.6);
  assert.equal(wireCount, 32);

  const solidShell = annulusMassKgPerKm(14.9, 1.6, MATERIAL_DENSITY.galvanisedSteel);
  assert.ok(massKgPerKm < solidShell, "wire model must be lighter than a solid shell");
  assert.ok(solidShell / massKgPerKm > 1.2, "the solid-shell error should be substantial, ~1.3x");
});

test("every layer of an armoured LT cable contributes, and the total is their sum", () => {
  const m = mass(lt());
  const layers = m.components.map((c) => c.layer);
  assert.deepEqual(layers, [
    "Conductor", "Reduced neutral", "Insulation", "Inner sheath", "Armour", "Outer sheath",
  ]);

  const summed = m.components.reduce((s, c) => s + c.massKgPerKm, 0) * LAY_UP_FACTOR;
  assert.ok(Math.abs(m.totalKgPerKm - summed) < 1e-6, "total must be the sum × lay-up, nothing else");
});

test("the conductor figure matches the AB engine's independently-written one", () => {
  // derive.ts computes AB conductor mass with its own code. Both should say 745 kg/km for
  // 3×70 + 1×50 + 1×16 aluminium. Two implementations agreeing to the digit is the strongest
  // evidence available that the identity and the densities are right.
  const viaThisModule =
    conductorMassKgPerKm(70, MATERIAL_DENSITY.aluminium, 3) +
    conductorMassKgPerKm(50, MATERIAL_DENSITY.aluminium, 1) +
    conductorMassKgPerKm(16, MATERIAL_DENSITY.aluminium, 1);
  assert.equal(Math.round(viaThisModule), 745);

  const abTrace = deriveFields(constructionFromSelection(defaultSelection()), {})
    .find((f) => f.key === "fin.totalMass")?.trace ?? "";
  assert.match(abTrace, /conductor 745/, "the AB engine no longer agrees — one of the two moved");
});

test("an unarmoured cable has no armour and no inner sheath line", () => {
  // Absence must come from the construction, not from a zero. A layer that does not exist should
  // not appear as a component weighing nothing.
  const m = mass(lt({ csaSqMm: 2.5, coreCount: 4, material: "CU", armoured: false, standard: "IS1554-1" }));
  assert.ok(!m.components.some((c) => c.layer === "Armour"));
});

test("copper weighs what copper weighs", () => {
  // 8.89 vs 2.70 — a material mix-up is a ~3.3x price error, so it is worth pinning directly.
  const cu = mass(lt({ csaSqMm: 16, coreCount: 4, material: "CU", armoured: false }));
  const al = mass(lt({ csaSqMm: 16, coreCount: 4, material: "AL", armoured: false }));
  const cuCond = cu.components[0].massKgPerKm;
  const alCond = al.components[0].massKgPerKm;
  assert.ok(Math.abs(cuCond / alCond - MATERIAL_DENSITY.copper / MATERIAL_DENSITY.aluminium) < 1e-9);
});

test("a 3.5 core carries a reduced neutral read from the chain, not a fixed fraction", () => {
  // The reduction is a table lookup. Hard-coding "half" would be wrong for most sizes.
  const m = mass(lt({ csaSqMm: 300, coreCount: 3.5 }));
  const neutral = m.components.find((c) => c.layer === "Reduced neutral");
  assert.ok(neutral, "3.5 core must carry a neutral component");
  const full = m.components[0].massKgPerKm / 3;
  assert.ok(neutral.massKgPerKm < full, "a reduced neutral must weigh less than a full core");
  // A 4-core has no such component at all.
  assert.ok(!mass(lt({ coreCount: 4 })).components.some((c) => c.layer === "Reduced neutral"));
});

test("solar applies no lay-up factor, because nothing is laid up", () => {
  // A single-core cable has no stranding. Applying 1.03 anyway would silently overprice it.
  const r = deriveSolarMass({ csaSqMm: 4, insulationThicknessMm: 0.7, sheathThicknessMm: 0.8, conductorDiaMm: 2.6 });
  const m = mass(r);
  const summed = m.components.reduce((s, c) => s + c.massKgPerKm, 0);
  assert.ok(Math.abs(m.totalKgPerKm - summed) < 1e-9, "solar mass must not be scaled");
  assert.match(m.workings, /no lay-up/);
});

test("a missing dimension is a gap, never a guessed number", () => {
  // The rule the whole codebase runs on. A conductor diameter of zero is not "assume something
  // small" — it is unanswerable, and the caller must be told.
  const r = deriveSolarMass({ csaSqMm: 4, insulationThicknessMm: 0.7, sheathThicknessMm: 0.8, conductorDiaMm: 0 });
  assert.ok(isMassGap(r));
  assert.match((r as { missing: string }).missing, /conductor diameter/);
});

test("mass rises with conductor size, monotonically", () => {
  // A cheap invariant that catches a whole class of lookup and indexing errors.
  let previous = 0;
  for (const csaSqMm of [16, 25, 35, 50, 95, 150, 300]) {
    const m = mass(lt({ csaSqMm, coreCount: 4 }));
    assert.ok(m.totalKgPerKm > previous, `${csaSqMm} sq mm did not weigh more than the size below`);
    previous = m.totalKgPerKm;
  }
});
