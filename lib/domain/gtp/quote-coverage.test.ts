/**
 * Coverage test: every cable type the builder offers must reach a PRICED quote.
 *
 * This exists because the gap it guards was invisible from the GTP side. AB and solar derived
 * clean, complete GTPs and then failed silently at the quote — `specFromFields` threw "AB and
 * solar quoting require the Construction union", the GTP saved with no linked cable, and the
 * quote list showed "No cable is linked to this GTP yet". Nothing errored where anyone was
 * looking.
 *
 * So the assertion is deliberately end-to-end: derive -> spec -> cost, per family. A type that
 * can be selected in the builder but cannot be priced is a broken product, however green its own
 * unit tests are.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { costCable } from "./quote-costing";
import { deriveFields } from "./derive";
import { deriveLtCable, type LtCableConfig } from "./derive-lt";
import { deriveLtFields } from "./derive-lt-fields";
import { deriveSolarFields, type SolarCableConfig } from "./derive-solar-fields";
import { deriveLtMass, deriveSolarMass, isMassGap } from "./mass";
import { parseSizeString } from "./parse-size";
import { specFromFields } from "./spec-from-fields";
import { isSpecGap, specFromAbConstruction, specFromSolarConstruction } from "./spec-from-construction";
import { conductorClassFor, solarDimensions } from "@/lib/domain/standards/is17293-2020";
import { DEFAULT_COST_BUILD_UP } from "@/lib/domain/costing";
import type { CableSpec, Material } from "@/lib/services/types";
import type { ResolvedField } from "./types";

/** Rates a quote needs. Values are arbitrary; only that a price comes out is under test. */
const MATERIALS: Material[] = [
  { id: "M1", name: "Aluminium rod", category: "Conductor", unit: "kg", ratePerKg: 250, matchMaterial: "Aluminium" },
  { id: "M2", name: "Copper rod", category: "Conductor", unit: "kg", ratePerKg: 900, matchMaterial: "Copper" },
  { id: "M3", name: "Aluminium alloy rod", category: "Conductor", unit: "kg", ratePerKg: 300, matchMaterial: "Aluminium Alloy" },
  { id: "M4", name: "XLPE compound", category: "Insulation", unit: "kg", ratePerKg: 165 },
  { id: "M5", name: "PVC compound", category: "Insulation", unit: "kg", ratePerKg: 120 },
  { id: "M6", name: "GI wire", category: "Armour", unit: "kg", ratePerKg: 95 },
  { id: "M7", name: "PVC ST2 sheath", category: "Sheath", unit: "kg", ratePerKg: 110 },
  { id: "M8", name: "LSZH sheath", category: "Sheath", unit: "kg", ratePerKg: 240 },
] as unknown as Material[];

const COMMERCIAL = {
  lengthM: 1000,
  buildUp: { ...DEFAULT_COST_BUILD_UP },
  metalRatePerKg: 0,
  overheadPerM: 18,
};

/** Resolve the data-entry gaps (ISI licence and the like) that are not the engine's business. */
const fill = (fs: ResolvedField[]): ResolvedField[] =>
  fs.map((f) => (f.gap ? { ...f, value: "CM/L-0000000", gap: false } : f));

function priced(spec: CableSpec) {
  const result = costCable(spec, COMMERCIAL, MATERIALS);
  assert.ok(result.lineTotalInr > 0, "a priced line must have a positive total");
  assert.ok(result.baseCostPerM > 0, "a priced line must have a positive cost per metre");
  return result;
}

test("LT XLPE power reaches a priced quote", () => {
  const config: LtCableConfig = { standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true, armourForm: "formed-wire", armourMethod: "A" };
  const spec = specFromFields({ specId: "S-LT", productLine: "XLPE_POWER", config, armourForm: deriveLtCable(config).armourForm, fields: fill(deriveLtFields(config)), designation: "3.5C x 300" });
  assert.ok(!isSpecGap(spec), `LT power must produce a spec: ${isSpecGap(spec) ? spec.reason : ""}`);
  if (isSpecGap(spec)) return;
  priced(spec);
});

test("control cable reaches a priced quote at 27 core x 2.5", () => {
  const config: LtCableConfig = { standard: "IS1554-1", csaSqMm: 2.5, coreCount: 27, material: "CU", armoured: true };
  const spec = specFromFields({ specId: "S-CTL", productLine: "PVC_CONTROL", config, armourForm: deriveLtCable(config).armourForm, fields: fill(deriveLtFields(config)), designation: "27C x 2.5" });
  assert.ok(!isSpecGap(spec), `control must produce a spec: ${isSpecGap(spec) ? spec.reason : ""}`);
  if (isSpecGap(spec)) return;
  priced(spec);
});

test("AB cable reaches a priced quote", () => {
  const parsed = parseSizeString("3Cx70+1Cx50+1Cx16");
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const fields = fill(deriveFields(parsed.construction, { customerName: "T" }));
  const spec = specFromAbConstruction({ specId: "S-AB", designation: "AB 3Cx70", construction: parsed.construction, fields, messengerConstruction: "covered" });
  assert.ok(!isSpecGap(spec), `AB must produce a spec: ${isSpecGap(spec) ? spec.reason : ""}`);
  if (isSpecGap(spec)) return;
  assert.equal(spec.family, "Aerial Bunched Cable");
  assert.equal(spec.aerialBunched?.messengerSizeSqMm, 50);
  assert.equal(spec.aerialBunched?.streetLightSizeSqMm, 16);
  priced(spec);
});

test("a bare-messenger AB cable prices lower than a covered one", () => {
  const parsed = parseSizeString("3Cx70+1Cx50+1Cx16");
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const build = (mc: "bare" | "covered") => {
    const fields = fill(deriveFields(parsed.construction, { customerName: "T", messengerConstruction: mc }));
    const spec = specFromAbConstruction({ specId: "S-AB", designation: "AB", construction: parsed.construction, fields, messengerConstruction: mc });
    assert.ok(!isSpecGap(spec));
    if (isSpecGap(spec)) throw new Error("unreachable");
    return priced(spec);
  };
  // The messenger's insulation wall is real money once it is priced per kg.
  assert.ok(build("bare").lineTotalInr < build("covered").lineTotalInr);
});

test("solar DC reaches a priced quote", () => {
  const config: SolarCableConfig = { csaSqMm: 4, directlyConnectedToModules: true, installationMethod: "free-in-air", ambientC: 60 };
  const { klass } = conductorClassFor(config.directlyConnectedToModules);
  const dims = solarDimensions(config.csaSqMm, klass);
  const conductorDiaMm = dims.values.meanOverallDiaMm - 2 * (dims.values.insulationThicknessMm + dims.values.sheathThicknessMm);
  const mass = deriveSolarMass({ csaSqMm: config.csaSqMm, insulationThicknessMm: dims.values.insulationThicknessMm, sheathThicknessMm: dims.values.sheathThicknessMm, conductorDiaMm });
  assert.ok(!isMassGap(mass));
  if (isMassGap(mass)) return;
  const spec = specFromSolarConstruction({
    specId: "S-SOL", designation: "Solar 4 sq mm", fields: fill(deriveSolarFields(config, {})),
    csaSqMm: config.csaSqMm, directlyConnectedToModules: true,
    insulationThicknessMm: dims.values.insulationThicknessMm, sheathThicknessMm: dims.values.sheathThicknessMm,
    conductorDiaMm, overallDiaMm: dims.values.meanOverallDiaMm, massKgPerKm: mass.totalKgPerKm,
  });
  assert.ok(!isSpecGap(spec), `solar must produce a spec: ${isSpecGap(spec) ? spec.reason : ""}`);
  if (isSpecGap(spec)) return;
  assert.equal(spec.family, "Solar DC Cable");
  assert.equal(spec.conductorMaterial, "Copper"); // IS 17293 §4.1 — not a choice
  assert.equal(spec.armour, "Unarmoured");
  priced(spec);
});

test("a bigger solar conductor costs more per metre", () => {
  const price = (csaSqMm: number) => {
    const config: SolarCableConfig = { csaSqMm, directlyConnectedToModules: true, installationMethod: "free-in-air", ambientC: 60 };
    const { klass } = conductorClassFor(true);
    const dims = solarDimensions(csaSqMm, klass);
    const conductorDiaMm = dims.values.meanOverallDiaMm - 2 * (dims.values.insulationThicknessMm + dims.values.sheathThicknessMm);
    const mass = deriveSolarMass({ csaSqMm, insulationThicknessMm: dims.values.insulationThicknessMm, sheathThicknessMm: dims.values.sheathThicknessMm, conductorDiaMm });
    assert.ok(!isMassGap(mass));
    if (isMassGap(mass)) throw new Error("unreachable");
    const spec = specFromSolarConstruction({
      specId: "S", designation: "Solar", fields: fill(deriveSolarFields(config, {})),
      csaSqMm, directlyConnectedToModules: true,
      insulationThicknessMm: dims.values.insulationThicknessMm, sheathThicknessMm: dims.values.sheathThicknessMm,
      conductorDiaMm, overallDiaMm: dims.values.meanOverallDiaMm, massKgPerKm: mass.totalKgPerKm,
    });
    assert.ok(!isSpecGap(spec));
    if (isSpecGap(spec)) throw new Error("unreachable");
    return priced(spec).baseCostPerM;
  };
  assert.ok(price(6) > price(4), "6 sq mm must cost more per metre than 4 sq mm");
});

test("an unfinished GTP still cannot be quoted, on any family", () => {
  // The gap guard is the reason a quote can be trusted; enabling AB and solar must not have
  // opened a route around it.
  const parsed = parseSizeString("3Cx70+1Cx50+1Cx16");
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const withGap = deriveFields(parsed.construction, { customerName: "T" }).map((f, i) =>
    i === 0 ? { ...f, gap: true, value: "not yet known" } : f,
  );
  const spec = specFromAbConstruction({ specId: "S", designation: "AB", construction: parsed.construction, fields: withGap, messengerConstruction: "covered" });
  assert.ok(isSpecGap(spec), "a GTP with an unresolved parameter must not produce a quotable cable");
});

test("a control quote prices the works mass, not the derived one", () => {
  // The derived build-up runs 3.5-10% light against the Daksha catalogue across the whole
  // control range — always light, because fillers, binder tape and armour lay take-up are in no
  // standard and so cannot be derived. That was unpriced material on every control line.
  const config: LtCableConfig = {
    standard: "IS1554-1", csaSqMm: 2.5, coreCount: 27, material: "CU",
    armoured: true, armourForm: "round-wire",
  };
  const spec = specFromFields({
    specId: "S-WORKS", productLine: "PVC_CONTROL", config,
    armourForm: deriveLtCable(config).armourForm,
    fields: fill(deriveLtFields(config)), designation: "27C x 2.5",
  });
  assert.ok(!isSpecGap(spec));
  if (isSpecGap(spec)) return;

  // The catalogue publishes 2015 kg/km for 27C x 2.5 round-wire armoured.
  assert.equal(spec.approxWeightKgPerKm, 2015);

  const result = priced(spec);
  const pricedKgPerKm = result.components.reduce((sum, c) => sum + c.kgPerM, 0) * 1000;
  assert.ok(
    Math.abs(pricedKgPerKm - 2015) < 25,
    `the quote must price the works mass: got ${pricedKgPerKm.toFixed(0)} against 2015 kg/km`,
  );
});

test("the conductor is never scaled — only the layers the build-up cannot model", () => {
  // Reconciling to the works mass must not touch the conductor: its weight follows from the
  // nominal area the standard specifies, and it is what the metal rate is charged against.
  const config: LtCableConfig = {
    standard: "IS1554-1", csaSqMm: 2.5, coreCount: 27, material: "CU",
    armoured: true, armourForm: "round-wire",
  };
  const plain = deriveLtMass(config);
  const reconciled = deriveLtMass(config, {}, 2015);
  assert.ok(!isMassGap(plain) && !isMassGap(reconciled));
  if (isMassGap(plain) || isMassGap(reconciled)) return;

  const conductorOf = (m: typeof plain) =>
    m.components.filter((c) => c.layer === "Conductor").reduce((s, c) => s + c.massKgPerKm, 0);
  assert.equal(conductorOf(reconciled), conductorOf(plain), "conductor mass must be untouched");
  assert.ok(reconciled.totalKgPerKm > plain.totalKgPerKm, "reconciling upward must raise the total");
  assert.match(reconciled.workings, /scaled x[\d.]+ to meet the works mass/);
});
