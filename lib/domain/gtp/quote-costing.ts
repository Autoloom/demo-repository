import { computeLine, ratesForSpec, type CostingResult, type MarginCategory } from "@/lib/domain/costing";
import type { CableSpec, Material } from "@/lib/services/types";
import { buildSpecFromFields, constructionKey, lineMassFromDerived, targetsFromBuild, type BuildSpec } from "./build-spec";
import { derivedLineMassFromLegacySpec, isBridgeGap, ltConfigFromLegacySpec } from "./legacy-bridge";
import { deriveLtCable } from "./derive-lt";
import { deriveLtFields } from "./derive-lt-fields";
import type { GtpSpecSource } from "./spec-from-fields";
import { deriveLtMass, isMassGap } from "./mass";
import { abDerivedMass, abGroupsFromSpec, isSpecGap, solarDerivedMass } from "./spec-from-construction";

/** Re-derive quote-local construction edits; never attach the old cable's mass to new inputs. */
export function quoteConstruction(spec: CableSpec): GtpSpecSource {
  if (!spec.gtpSource) throw new Error("No GTP construction is attached");
  const config = ltConfigFromLegacySpec(spec);
  if (isBridgeGap(config)) throw new Error(config.reason);
  if (spec.standard !== (config.standard === "IS7098-1" ? "IS 7098-1" : "IS 1554-1")) throw new Error("Selected standard contradicts the cable family");
  if (spec.voltageGrade !== "650/1100 V (1.1 kV)") throw new Error("This LT engine covers 650/1100 V only — IS §1.2");
  if (!spec.conductorClass.startsWith("Class 2")) throw new Error("The encoded conductor lookup requires Class 2 — IS 8130 Table 2");
  if (spec.insulation !== (config.standard === "IS7098-1" ? "XLPE" : "PVC (Type A)")) throw new Error("Selected insulation contradicts the standard's construction");
  if (!["Unarmoured", "GI round wire (GSW)", "GI strip (GSS)"].includes(spec.armour)) throw new Error("No encoded mass model for this armour material");
  config.armourForm = spec.armour === "GI strip (GSS)" ? "formed-wire" : "round-wire";
  // Carry the armouring PRACTICE across from the GTP.
  //
  // `ltConfigFromLegacySpec` rebuilds the config from the legacy CableSpec fields, which record
  // the armour MATERIAL ("GI strip (GSS)") but not which of IS 7098-1 Table 6's two methods
  // produced its thickness. Left to default, a GTP approved under method B (1.4 mm strip) would
  // be re-derived here at method A (0.8 mm) — on 3.5C x 300 that is 5971 vs 5071 kg/km, so the
  // quote would price ~900 kg/km less metal than the cable the customer stamped.
  config.armourMethod = spec.gtpSource.config.armourMethod;
  config.conductorClass = "Class 2";
  const chain = deriveLtCable(config);
  if (spec.cores === "3.5C" && spec.neutralSizeSqMm !== chain.steps.find((s) => s.id === "neutral.reduced")?.value) throw new Error("Reduced neutral contradicts IS Table 2 for the selected phase size");
  const original = spec.gtpSource;
  const unchanged = config.standard === original.config.standard && config.coreCount === original.config.coreCount && config.csaSqMm === original.config.csaSqMm && config.material === original.config.material && config.armoured === original.config.armoured && chain.armourForm === original.armourForm && (config.armourMethod ?? "A") === (original.config.armourMethod ?? "A");
  if (unchanged) return original;
  const fields = deriveLtFields(config).map((field) => field.key.startsWith("mfr.") ? original.fields.find((f) => f.key === field.key) ?? field : field);
  return { productLine: config.standard === "IS7098-1" ? "XLPE_POWER" : "PVC_CONTROL", config, armourForm: chain.armourForm, fields };
}

export function quoteBuild(spec: CableSpec, previous?: BuildSpec): { source: GtpSpecSource; build: BuildSpec } {
  const source = quoteConstruction(spec);
  // A change of cable resets targets to nominal; a target chosen for one size never silently
  // becomes the manufacturing policy for another size.
  const targets = previous?.constructionKey && previous.constructionKey !== constructionKey(source) ? {} : targetsFromBuild(previous);
  return { source, build: buildSpecFromFields(spec.id, source, targets) };
}

export function costCable(spec: CableSpec, commercial: { lengthM: number; marginPctByCategory: Record<MarginCategory, number>; metalRatePerKg: number; overheadPerM: number }, materials: Material[], build?: BuildSpec): CostingResult {
  let mass;
  // AB and solar have their own derivation chains and no `gtpSource` — their constructions do not
  // fit LtCableConfig. Routed by family so the shared engine keeps one branch per FAMILY rather
  // than a product-line conditional buried in the costing.
  if (spec.family === "Aerial Bunched Cable" && spec.aerialBunched) {
    const derived = abDerivedMass(
      { productLine: "AB_CABLE", groups: abGroupsFromSpec(spec.aerialBunched), raw: spec.designation },
      spec.aerialBunched.messengerInsulated === false ? "bare" : "covered",
    );
    if (isSpecGap(derived)) throw new Error(derived.reason);
    mass = derived;
  } else if (spec.family === "Solar DC Cable") {
    const derived = solarDerivedMass({
      csaSqMm: spec.conductorSizeSqMm,
      // The class the spec was built with is the class the standard's dimension table needs.
      directlyConnectedToModules: spec.conductorClass === "Class 5 (flexible)",
    });
    if (isSpecGap(derived)) throw new Error(derived.reason);
    mass = derived;
  } else if (spec.gtpSource) {
    if ((spec.flameClass === "FRLS" || spec.flameClass === "FR") && !materials.some((m) => m.category === "Sheath" && (spec.flameClass === "FRLS" ? /FRLS/i.test(m.name) : /\bFR\b/i.test(m.name)))) {
      throw new Error(`Enter a ${spec.flameClass} sheath compound rate in Materials before pricing this buyer requirement`);
    }
    const { source, build: checked } = quoteBuild(spec, build);
    const result = deriveLtMass(source.config, targetsFromBuild(checked));
    if (isMassGap(result)) throw new Error(result.missing);
    mass = lineMassFromDerived(result);
  } else {
    const result = derivedLineMassFromLegacySpec(spec);
    if (isBridgeGap(result)) throw new Error(result.reason);
    mass = result;
  }
  const rates = ratesForSpec(spec, materials);
  return computeLine({ spec, lengthM: commercial.lengthM, marginPctByCategory: commercial.marginPctByCategory, derivedMass: mass,
    rates: { ...rates, conductorPerKg: commercial.metalRatePerKg || rates.conductorPerKg, labourPerM: commercial.overheadPerM } });
}
