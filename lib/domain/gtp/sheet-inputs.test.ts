/**
 * What a saved sheet has to carry for "edit and recalculate" to be true.
 *
 * A GTP stores its INPUTS (`GtpSheetInputs`) and its RESULTS (`derivedFields`) separately, and
 * reopening one re-runs the build-up from the inputs alone. That only works if the inputs are
 * complete: an input the chain reads but the record does not store comes back as whatever the
 * default happens to be, and the reopened sheet is quietly a different cable from the one that
 * was saved — with the same GTP number on it.
 *
 * Armour method is the standing example. `GtpTemplate.ltConfig` omitted `armourForm` and
 * `armourMethod` while the builder wrote them anyway, so they survived only because JSON carried
 * keys the type denied. Anything that narrowed the object on the way through — a mapped copy, a
 * `satisfies`, a service that rebuilt it field by field — dropped them, and a 6.1 × 1.4 sheet
 * reopened as 4 × 0.8: a different thickness of steel, a different outer sheath band and 900
 * kg/km less metal. Costing had this same defect against these same two fields.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveLtCable, type LtCableConfig } from "./derive-lt";
import { deriveLtFields } from "./derive-lt-fields";
import { deriveLtMass, isMassGap } from "./mass";
import type { GtpSheetInputs } from "./templates";

/** The builder's own reconstruction: sheet inputs back into the config the chain consumes. */
function configFromSheetInputs(inputs: GtpSheetInputs): LtCableConfig {
  assert.ok(inputs.ltConfig, "an LT sheet must store its construction");
  return {
    standard: inputs.productLine === "XLPE_POWER" ? "IS7098-1" : "IS1554-1",
    csaSqMm: inputs.ltConfig.csaSqMm,
    coreCount: inputs.ltConfig.coreCount,
    material: inputs.conductorMaterial ?? "AL",
    armoured: inputs.ltConfig.armoured,
    armourForm: inputs.ltConfig.armourForm,
    armourMethod: inputs.ltConfig.armourMethod,
  };
}

/** What the builder stores on Generate, for a config it has resolved. */
function sheetInputsFor(config: LtCableConfig): GtpSheetInputs {
  return {
    productLine: config.standard === "IS7098-1" ? "XLPE_POWER" : "PVC_CONTROL",
    sizeInput: `${config.coreCount}Cx${config.csaSqMm}`,
    ltConfig: {
      csaSqMm: config.csaSqMm,
      coreCount: config.coreCount,
      armoured: config.armoured,
      armourForm: config.armourForm,
      armourMethod: config.armourMethod,
    },
    conductorMaterial: config.material,
    hiddenFields: [],
    customParameters: [],
    overrides: {},
    toleranceOverrides: {},
  };
}

const CONFIGS: LtCableConfig[] = [
  { standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true, armourForm: "formed-wire", armourMethod: "A" },
  { standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true, armourForm: "formed-wire", armourMethod: "B" },
  { standard: "IS7098-1", csaSqMm: 240, coreCount: 3.5, material: "AL", armoured: true, armourForm: "round-wire" },
  { standard: "IS7098-1", csaSqMm: 95, coreCount: 4, material: "CU", armoured: true, armourForm: "formed-wire", armourMethod: "A" },
  { standard: "IS7098-1", csaSqMm: 120, coreCount: 3, material: "AL", armoured: false },
  { standard: "IS1554-1", csaSqMm: 2.5, coreCount: 27, material: "CU", armoured: true, armourForm: "round-wire" },
];

test("a saved sheet re-derives to the cable it was saved as — every field, every construction", () => {
  for (const config of CONFIGS) {
    const before = deriveLtFields(config);
    // Through JSON, because that is how a stored record actually comes back.
    const reopened = configFromSheetInputs(
      JSON.parse(JSON.stringify(sheetInputsFor(config))) as GtpSheetInputs,
    );
    const after = deriveLtFields(reopened);
    assert.deepEqual(
      after.map((f) => [f.key, f.value, f.trace]),
      before.map((f) => [f.key, f.value, f.trace]),
      `${config.coreCount}C x ${config.csaSqMm} ${config.material} ${config.armourForm ?? "unarmoured"}` +
        `${config.armourMethod ? ` method ${config.armourMethod}` : ""}: a stored input is missing, so ` +
        "reopening this GTP gives a different cable under the same number",
    );
  }
});

test("armour method is one of those inputs — dropping it changes the steel, the sheath and the mass", () => {
  // The guard above only bites if the two methods genuinely differ. If this ever stops being
  // true the round-trip test passes vacuously for the field that has actually gone missing.
  const a: LtCableConfig = { standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true, armourForm: "formed-wire", armourMethod: "A" };
  const b: LtCableConfig = { ...a, armourMethod: "B" };

  assert.equal(deriveLtCable(a).armourDiaOrThicknessMm, 0.8);
  assert.equal(deriveLtCable(b).armourDiaOrThicknessMm, 1.4);
  assert.notEqual(
    deriveLtCable(a).outerSheathThicknessMm,
    deriveLtCable(b).outerSheathThicknessMm,
  );

  const massA = deriveLtMass(a);
  const massB = deriveLtMass(b);
  assert.ok(!isMassGap(massA) && !isMassGap(massB));
  if (isMassGap(massA) || isMassGap(massB)) return;
  assert.ok(
    massB.totalKgPerKm - massA.totalKgPerKm > 500,
    `method B should carry appreciably more steel; got ${massA.totalKgPerKm} vs ${massB.totalKgPerKm}`,
  );
});

test("conductor material is an input too — control cable reopened as aluminium is 500 kg/km light", () => {
  // Material is not implied by the size, and `GtpSheetInputs` is the only place a record keeps
  // the answer. Control is a copper line; reopening one without the material would take the
  // builder's aluminium default.
  const cu: LtCableConfig = { standard: "IS1554-1", csaSqMm: 2.5, coreCount: 27, material: "CU", armoured: true, armourForm: "round-wire" };
  const al: LtCableConfig = { ...cu, material: "AL" };
  const mCu = deriveLtMass(cu);
  const mAl = deriveLtMass(al);
  assert.ok(!isMassGap(mCu) && !isMassGap(mAl));
  if (isMassGap(mCu) || isMassGap(mAl)) return;
  assert.ok(mCu.totalKgPerKm > mAl.totalKgPerKm + 400, "copper is the heavier conductor by a wide margin");
  assert.equal(configFromSheetInputs(sheetInputsFor(cu)).material, "CU");
});

test("a sheet with no stored material falls back rather than throwing — old records still open", () => {
  // Records saved before the material was stored have none. They were aluminium, which is the
  // builder's default for every line that offers a choice.
  const legacy: GtpSheetInputs = {
    productLine: "XLPE_POWER",
    sizeInput: "3.5Cx300",
    ltConfig: { csaSqMm: 300, coreCount: 3.5, armoured: true },
  };
  const config = configFromSheetInputs(legacy);
  assert.equal(config.material, "AL");
  assert.ok(deriveLtFields(config).length > 0);
});
