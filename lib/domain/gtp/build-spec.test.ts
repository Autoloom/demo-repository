import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveLtFields } from "./derive-lt-fields";
import { buildSpecFromFields } from "./build-spec";
import { specFromFields, type GtpSpecSource } from "./spec-from-fields";
import { annulusMassKgPerKm, LAY_UP_FACTOR, MATERIAL_DENSITY } from "./mass";
import { deriveLtCable } from "./derive-lt";
import { costCable } from "./quote-costing";
import { defaultMarginByCategory } from "@/lib/domain/costing";
import { seedData } from "@/lib/seed/data";

const config = { standard: "IS7098-1" as const, coreCount: 3.5, csaSqMm: 240, material: "AL" as const, armoured: true };
const source: GtpSpecSource = { productLine: "XLPE_POWER", config, armourForm: "round-wire", fields: deriveLtFields(config).map((f) => f.key === "mfr.isiLicence" ? { ...f, value: "TEST-LICENCE", gap: false } : f) };

test("only published is-rule floors permit movement, with exact floor rather than rounded percentage", () => {
  const build = buildSpecFromFields("S", source);
  const insulation = build.layers.find((l) => l.layer === "lt.insulation")!;
  assert.equal(insulation.floorMm, 1.43); assert.equal(insulation.builtMm, 1.7);
  for (const layer of build.layers.filter((l) => l.layer !== "lt.insulation")) assert.equal(layer.floorMm, null);
  assert.equal(build.massAtBuiltKgPerKm, build.massAtDeclaredKgPerKm);
});
test("below-floor, non-finite, unknown-layer and fixed-layer targets are refused", () => {
  assert.throws(() => buildSpecFromFields("S", source, { "lt.insulation": 1.4 }), /§10.3/);
  assert.throws(() => buildSpecFromFields("S", source, { "lt.insulation": NaN }), /§10.3/);
  assert.throws(() => buildSpecFromFields("S", source, { "lt.innerSheath": 0.01 }), /Inner sheath/);
  assert.throws(() => buildSpecFromFields("S", source, { "lt.conductor.resistance": 0.01 }), /Unknown build layer/);
  assert.doesNotThrow(() => buildSpecFromFields("S", source, { "lt.insulation": 1.43 }));
});
test("works and manually edited tolerances cannot create manufacturing headroom", () => {
  for (const origin of ["manual", "works-estimate", "customer"] as const) {
    const altered = { ...source, fields: source.fields.map((f) => f.key === "lt.insulation" ? { ...f, tolerance: { value: "−50%", origin, trace: "not a standard", floorMm: 0.85 } } : f) };
    assert.throws(() => buildSpecFromFields("S", altered, { "lt.insulation": 1.5 }), /not permitted/);
  }
});
test("mass reduction is exactly the changed annulus, including the shared lay-up factor", () => {
  const build = buildSpecFromFields("S", source, { "lt.insulation": 1.5 });
  const dL = deriveLtCable(config).steps.find((s) => s.id === "calc.dL")!.value;
  const expected = (annulusMassKgPerKm(dL, 1.7, MATERIAL_DENSITY.xlpe) - annulusMassKgPerKm(dL, 1.5, MATERIAL_DENSITY.xlpe)) * 3 * LAY_UP_FACTOR;
  assert.ok(Math.abs(build.massAtDeclaredKgPerKm - build.massAtBuiltKgPerKm - expected) < 1e-8);
  assert.ok(build.massAtBuiltKgPerKm < build.massAtDeclaredKgPerKm);
});
test("quotation prices built layer masses, survives JSON reload, and uses buyer flame compound rates", () => {
  const spec = specFromFields({ ...source, specId: "S", designation: "3.5C x 240" }); assert.ok(!("gap" in spec));
  const commercial = { lengthM: 1000, marginPctByCategory: defaultMarginByCategory(12), metalRatePerKg: 250, overheadPerM: 18 };
  const build = buildSpecFromFields("S", source, { "lt.insulation": 1.5 });
  const nominal = costCable(spec, commercial, seedData.materials);
  const built = costCable(spec, commercial, seedData.materials, build);
  assert.ok(built.lineTotalInr < nominal.lineTotalInr);
  assert.ok(Math.abs(built.components.reduce((s, c) => s + c.kgPerM, 0) * 1000 - build.massAtBuiltKgPerKm) < 1e-8);
  assert.deepEqual(costCable(JSON.parse(JSON.stringify(spec)), commercial, seedData.materials, JSON.parse(JSON.stringify(build))), built);
  assert.ok(costCable({ ...spec, flameClass: "LSZH", sheath: "Zero-halogen (ZHFR/LSZH)" }, commercial, seedData.materials, build).lineTotalInr > built.lineTotalInr);
});

test("construction edits re-derive mass and reset the old cable's build decision", async () => {
  const { quoteBuild } = await import("./quote-costing");
  const spec = specFromFields({ ...source, specId: "S", designation: "3.5C x 240" }); assert.ok(!("gap" in spec));
  const original = buildSpecFromFields("S", source, { "lt.insulation": 1.5 });
  const changed = { ...spec, conductorSizeSqMm: 300, neutralSizeSqMm: 150 };
  const next = quoteBuild(changed, original);
  assert.equal(next.source.config.csaSqMm, 300);
  assert.equal(next.build.massAtBuiltKgPerKm, next.build.massAtDeclaredKgPerKm);
  assert.notEqual(next.build.massAtDeclaredKgPerKm, original.massAtDeclaredKgPerKm);
  assert.equal(spec.gtpSource!.config.csaSqMm, 240, "shared declaration remains unchanged");
  assert.throws(() => quoteBuild({ ...spec, conductorSizeSqMm: 16 }, original), /Table 2/);
  assert.throws(() => quoteBuild({ ...spec, neutralSizeSqMm: 70 }, original), /neutral.*Table 2/);
});
test("buyer FRLS selects its own entered compound rate, never invents one", () => {
  const spec = specFromFields({ ...source, specId: "S", designation: "3.5C x 240" }); assert.ok(!("gap" in spec));
  const commercial = { lengthM: 1000, marginPctByCategory: defaultMarginByCategory(12), metalRatePerKg: 250, overheadPerM: 18 };
  const frls = { ...spec, flameClass: "FRLS" as const, sheath: "FRLS PVC" as const };
  assert.throws(() => costCable(frls, commercial, seedData.materials), /Enter a FRLS sheath compound rate/);
  const materials = [...seedData.materials, { ...seedData.materials.find((m) => m.category === "Sheath")!, id: "TEST-FRLS", name: "FRLS PVC", ratePerKg: 180 }];
  const result = costCable(frls, commercial, materials);
  assert.equal(result.components.find((c) => c.label === "Sheath")!.ratePerKg, 180);
});
