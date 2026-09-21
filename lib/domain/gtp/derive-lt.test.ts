import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveLtCable } from "./derive-lt";

test("the 3.5C x 300 A2XFY chain produces a fully-traced build-up", () => {
  const r = deriveLtCable({ standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true });
  assert.equal(r.insulationThicknessMm, 1.8);
  assert.equal(r.innerSheathThicknessMm, 0.6);
  assert.equal(r.armourDiaOrThicknessMm, 2.5);
  assert.equal(r.outerSheathThicknessMm, 2.36);
  assert.equal(r.calculatedDiaUnderOuterSheathMm, 58.2);
  for (const s of r.steps) assert.ok(s.ref.length > 0, `${s.id} must carry provenance`);
});

test("every keyed step names the diameter it was looked up by", () => {
  // The audit property: a reviewer must be able to see WHY a sheath thickness was chosen.
  const r = deriveLtCable({ standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true });
  const keyed = ["innerSheath", "armour", "outerSheath"];
  for (const id of keyed) {
    const step = r.steps.find((s) => s.id === id);
    assert.ok(step?.keyedBy, `${id} must record its lookup key`);
    assert.match(step.keyedBy, /calculated diameter/);
  }
});

test("the chain is sequential — each diameter exceeds the one before it", () => {
  const r = deriveLtCable({ standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true });
  const dias = r.steps.filter((s) => s.id.startsWith("calc.") && !s.id.endsWith(".neutral")).map((s) => s.value);
  for (let i = 1; i < dias.length; i++) {
    assert.ok(dias[i] > dias[i - 1], `diameter shrank at step ${i}: ${dias[i - 1]} → ${dias[i]}`);
  }
});

test("XLPE and PVC diverge only where the standards diverge", () => {
  const xlpe = deriveLtCable({ standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true });
  const pvc = deriveLtCable({ standard: "IS1554-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true });
  // PVC insulation is thicker, so the whole chain runs larger...
  assert.ok(pvc.insulationThicknessMm > xlpe.insulationThicknessMm);
  assert.ok(pvc.calculatedDiaUnderOuterSheathMm > xlpe.calculatedDiaUnderOuterSheathMm);
  // ...but the step SEQUENCE is identical — one engine, two datasets.
  assert.deepEqual(xlpe.steps.map((s) => s.id), pvc.steps.map((s) => s.id));
});

test("single-core cables have no inner sheath and take the thicker insulation", () => {
  const r = deriveLtCable({ standard: "IS7098-1", csaSqMm: 300, coreCount: 1, material: "AL", armoured: true });
  assert.equal(r.innerSheathThicknessMm, null, "§13.3: single-core cables have no inner sheath");
  assert.equal(r.insulationThicknessMm, 2.1, "single-core armoured column");
  assert.equal(r.steps.find((s) => s.id === "innerSheath"), undefined);
});

test("unarmoured cables skip the armour step and take the NOMINAL outer sheath", () => {
  const armoured = deriveLtCable({ standard: "IS7098-1", csaSqMm: 95, coreCount: 4, material: "AL", armoured: true });
  const plain = deriveLtCable({ standard: "IS7098-1", csaSqMm: 95, coreCount: 4, material: "AL", armoured: false });
  assert.ok(armoured.armourDiaOrThicknessMm);
  assert.equal(plain.armourDiaOrThicknessMm, null);
  // Armoured uses col 5 (minimum), unarmoured uses col 3 (nominal) — different columns.
  assert.ok(plain.outerSheathThicknessMm > armoured.outerSheathThicknessMm);
});

test("small cables are forced to round-wire armour whatever was requested", () => {
  // §14.2: at or below 13 mm calculated diameter, the armour SHALL be round wire.
  const r = deriveLtCable({
    standard: "IS7098-1", csaSqMm: 1.5, coreCount: 2, material: "CU", armoured: true, armourForm: "formed-wire",
  });
  const armour = r.steps.find((s) => s.id === "armour");
  assert.match(armour?.label ?? "", /round wire/i, "formed wire must not be selectable below 13 mm");
  assert.equal(r.armourDiaOrThicknessMm, 1.4);
});

test("3.5-core uses the reduced-neutral formula, not the 4-core coefficient", () => {
  const threeHalf = deriveLtCable({ standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true });
  const four = deriveLtCable({ standard: "IS7098-1", csaSqMm: 300, coreCount: 4, material: "AL", armoured: true });
  // A reduced neutral is smaller than a full core, so 3.5-core must come out below 4-core.
  assert.ok(threeHalf.calculatedDiaUnderOuterSheathMm < four.calculatedDiaUnderOuterSheathMm);
  assert.ok(threeHalf.steps.some((s) => s.id === "neutral.reduced"));
  assert.ok(!four.steps.some((s) => s.id === "neutral.reduced"));
});

test("bigger conductors yield thicker sheaths, monotonically", () => {
  let prev = 0;
  for (const csa of [25, 50, 95, 185, 300, 400, 630]) {
    const r = deriveLtCable({ standard: "IS7098-1", csaSqMm: csa, coreCount: 3.5, material: "AL", armoured: true });
    assert.ok(r.calculatedDiaUnderOuterSheathMm > prev, `diameter did not grow at ${csa} sq mm`);
    prev = r.calculatedDiaUnderOuterSheathMm;
  }
});

test("copper and aluminium differ in resistance but share the geometry", () => {
  const al = deriveLtCable({ standard: "IS7098-1", csaSqMm: 95, coreCount: 4, material: "AL", armoured: true });
  const cu = deriveLtCable({ standard: "IS7098-1", csaSqMm: 95, coreCount: 4, material: "CU", armoured: true });
  const r = (d: typeof al) => d.steps.find((s) => s.id === "conductor.resistance")!.value;
  assert.ok(r(al) > r(cu), "aluminium is more resistive");
  // IS 10462 ignores material entirely (§0.3), so the diameters must match exactly.
  assert.equal(al.calculatedDiaUnderOuterSheathMm, cu.calculatedDiaUnderOuterSheathMm);
});

test("a cable outside the tables throws rather than producing a GTP", () => {
  assert.throws(() => deriveLtCable({ standard: "IS7098-1", csaSqMm: 75, coreCount: 3, material: "AL", armoured: true }));
});
