import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveLtCable } from "./derive-lt";
import type { LtCableConfig } from "./derive-lt";
import { deriveLtFields } from "./derive-lt-fields";
import { deriveLtMass } from "./mass";

/** 3.5C x 240 sq mm aluminium — the size the Sept 2026 review is about. */
const base: LtCableConfig = {
  standard: "IS7098-1",
  csaSqMm: 240,
  coreCount: 3.5,
  material: "AL",
  armoured: true,
};

test("method A gives the 4.0 x 0.8 mm strip the manufacturer asked for", () => {
  const r = deriveLtCable({ ...base, armourForm: "formed-wire", armourMethod: "A" });
  assert.equal(r.armourForm, "formed-wire");
  assert.equal(r.armourDiaOrThicknessMm, 0.8);
  assert.equal(r.armourWidthMm, 4.0);
  assert.equal(r.armourMethod, "A");
});

test("method A is the default, so asking for strip gives 0.8 without naming a practice", () => {
  const r = deriveLtCable({ ...base, armourForm: "formed-wire" });
  assert.equal(r.armourDiaOrThicknessMm, 0.8);
  assert.equal(r.armourMethod, "A");
});

test("method B steps up to 6.1 x 1.4 on the same cable — both are standard-compliant", () => {
  // At 240 sq mm the calculated diameter under armour is past 40 mm, which is where the banded
  // table leaves 0.8 behind. Two legitimate answers for one cable is the whole reason the
  // practice is a choice and not a derivation.
  const r = deriveLtCable({ ...base, armourForm: "formed-wire", armourMethod: "B" });
  assert.equal(r.armourDiaOrThicknessMm, 1.4);
  assert.equal(r.armourWidthMm, 6.1);
  assert.equal(r.armourMethod, "B");
});

test("the two practices are traced differently, so a GTP says which one built it", () => {
  const a = deriveLtCable({ ...base, armourForm: "formed-wire", armourMethod: "A" });
  const b = deriveLtCable({ ...base, armourForm: "formed-wire", armourMethod: "B" });
  assert.match(a.steps.find((s) => s.id === "armour")!.ref, /method A/);
  assert.match(b.steps.find((s) => s.id === "armour")!.ref, /method B/);
});

test("strip is lighter than round wire on the same cable, and the mass moves with the choice", () => {
  // The point of the whole change: before armour form was selectable, switching wire to strip
  // moved nothing. Round wire at this size is 2.5 mm; strip under method A is 0.8 mm.
  const strip = deriveLtMass({ ...base, armourForm: "formed-wire", armourMethod: "A" });
  const wire = deriveLtMass({ ...base, armourForm: "round-wire" });
  assert.ok(!("gap" in strip) && !("gap" in wire), "both constructions must price");
  if ("gap" in strip || "gap" in wire) return;
  assert.ok(
    strip.totalKgPerKm < wire.totalKgPerKm,
    `strip ${strip.totalKgPerKm.toFixed(0)} should be lighter than wire ${wire.totalKgPerKm.toFixed(0)} kg/km`,
  );
});

test("below 13 mm the standard's round-wire rule overrides the request", () => {
  // §14.2 — "where the calculated diameter below armouring does not exceed 13 mm, the armour
  // shall consist of round wires". A preference must not be able to breach that.
  const r = deriveLtCable({
    standard: "IS7098-1", csaSqMm: 1.5, coreCount: 2, material: "CU",
    armoured: true, armourForm: "formed-wire", armourMethod: "A",
  });
  assert.equal(r.armourForm, "round-wire");
  assert.equal(r.armourWidthMm, null);
  assert.equal(r.armourMethod, null);
});

test("width is printed but never load-bearing — the two practices' diameters differ only by thickness", () => {
  // Steel area of a strip layer is pi(D + t)t, in which width cancels. So a change of width must
  // not move the build-up; only thickness may.
  const a = deriveLtCable({ ...base, armourForm: "formed-wire", armourMethod: "A" });
  const dBa = a.steps.find((s) => s.id === "calc.diaUnderArmour")!.value;
  const dXa = a.steps.find((s) => s.id === "calc.diaUnderSheath")!.value;
  // D_X is D_B grown by twice the THICKNESS, not the width.
  assert.ok(Math.abs(dXa - (dBa + 2 * 0.8)) < 0.15, `${dXa} should be ${dBa} + 2 x 0.8, within rounding`);
});

test("the GTP prints the armour size the way a buyer writes it", () => {
  const fields = deriveLtFields({ ...base, armourForm: "formed-wire", armourMethod: "A" });
  const size = fields.find((f) => f.key === "lt.armourSize");
  assert.ok(size, "an armour size row must reach the GTP");
  assert.equal(size.value, "4 × 0.8 mm");
  assert.match(size.label, /galvanised steel strip/i);
});

test("core identification reaches the LT schedule as a derived row, not a customer quirk", () => {
  const fields = deriveLtFields({ ...base, armourForm: "formed-wire" });
  const ident = fields.find((f) => f.key === "cable.identification");
  assert.ok(ident, "core identification must be on the schedule");
  assert.equal(ident.value, "Red / Yellow / Blue (phases), Black (reduced neutral)");
  assert.equal(ident.source, "is-table");
});

test("a 27 core control cable identifies by numbering, and still prices", () => {
  const config: LtCableConfig = {
    standard: "IS1554-1", csaSqMm: 2.5, coreCount: 27, material: "CU", armoured: true,
  };
  const ident = deriveLtFields(config).find((f) => f.key === "cable.identification");
  assert.match(String(ident!.value), /numbered 1 to 27/);
  const mass = deriveLtMass(config);
  assert.ok(!("gap" in mass), "27 x 2.5 must produce a mass, not a gap");
});
