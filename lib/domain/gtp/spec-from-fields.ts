import { CORE_CONFIGS } from "@/lib/services/types";
import type { CableSpec, CoreConfig } from "@/lib/services/types";
import { deriveLtCable, type LtCableConfig, type LtDerivation } from "./derive-lt";
import type { ProductLine, ResolvedField } from "./types";

export interface GtpSpecSource {
  productLine: ProductLine;
  config: LtCableConfig;
  armourForm: LtDerivation["armourForm"];
  fields: ResolvedField[];
}

export function fieldNumber(fields: ResolvedField[], key: string): number {
  const field = fields.find((f) => f.key === key);
  const match = String(field?.value ?? "").match(/^\s*(\d+(?:\.\d+)?)(?:\s|$)/);
  const value = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(value)) throw new Error(`Missing numeric field ${key}`);
  return value;
}

/** Construction supplies materials; resolved fields supply dimensions. No display-label parsing. */
export function specFromFields(input: GtpSpecSource & { specId: string; designation: string }): CableSpec | { gap: true; reason: string } {
  try {
    const { config, fields, productLine, armourForm } = input;
    if (productLine !== "XLPE_POWER" && productLine !== "PVC_CONTROL") throw new Error("AB and solar quoting require the Construction union");
    if (!input.specId || !fields.length) throw new Error("Cable identity and resolved fields are required");
    const gap = fields.find((f) => f.gap);
    if (gap) throw new Error(`${gap.label}: ${gap.value}`);
    const chain = deriveLtCable(config); // also refuses unsupported combinations such as 3.5C × 16
    if (chain.armourForm !== armourForm) throw new Error("Armour form disagrees with the derived construction");
    const cores = `${config.coreCount}C` as CoreConfig;
    if (!CORE_CONFIGS.includes(cores)) throw new Error(`Core configuration ${cores} cannot be represented by CableSpec`);
    const xlpe = config.standard === "IS7098-1";
    if (xlpe !== (productLine === "XLPE_POWER")) throw new Error("Product line and standard disagree");
    // A dimensional override needs a new resolved build-up, not the old chain's mass.
    for (const step of chain.steps) {
      if (Math.abs(fieldNumber(fields, `lt.${step.id}`) - step.value) > 0.005) throw new Error(`${step.label} differs from the build-up chain; re-derive before quoting`);
    }
    return {
      id: input.specId, family: xlpe ? "LT XLPE Power" : "Control Cable",
      standard: xlpe ? "IS 7098-1" : "IS 1554-1", voltageGrade: "650/1100 V (1.1 kV)",
      cores, conductorMaterial: config.material === "AL" ? "Aluminium" : "Copper",
      conductorClass: "Class 2 (stranded)", // exactly the Class 2 input supported by deriveLtCable
      conductorSizeSqMm: config.csaSqMm,
      neutralSizeSqMm: config.coreCount === 3.5 ? fieldNumber(fields, "lt.neutral.reduced") : undefined,
      insulation: xlpe ? "XLPE" : "PVC (Type A)",
      armour: armourForm === "round-wire" ? "GI round wire (GSW)" : armourForm === "formed-wire" ? "GI strip (GSS)" : "Unarmoured",
      sheath: xlpe ? "PVC (ST2)" : "PVC (ST1)", flameClass: "Standard",
      designation: input.designation,
      approxOuterDiaMm: chain.calculatedDiaUnderOuterSheathMm + 2 * fieldNumber(fields, "lt.outerSheath"),
      approxWeightKgPerKm: fieldNumber(fields, "fin.totalMass"),
      technical: {
        conductorResistanceOhmPerKm: fieldNumber(fields, "lt.conductor.resistance"),
        coreIdentification: fields.find((f) => f.key === "cable.identification")?.value.toString(),
      },
      gtpSource: { productLine, config: { ...config, conductorClass: config.conductorClass ?? "Class 2" }, armourForm, fields },
    };
  } catch (error) {
    return { gap: true, reason: error instanceof Error ? error.message : String(error) };
  }
}
