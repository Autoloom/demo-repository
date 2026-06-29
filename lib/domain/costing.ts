/**
 * Bill-of-materials quote costing + GST split (data-models.md §5, upgraded).
 *
 * HOW THE COST OF A CABLE IS BUILT UP (read this before changing numbers):
 *
 *   A cable's cost per metre is the sum of its physical parts, each priced by weight:
 *
 *     conductor  = (kg of metal per metre) × (₹/kg for that metal)
 *     insulation = (kg of insulation per metre) × (₹/kg)
 *     armour     = (kg of armour per metre) × (₹/kg)      [0 if unarmoured]
 *     sheath     = (kg of sheath per metre) × (₹/kg)
 *     labour     = a flat ₹/m for drawing, extrusion, armouring, testing, drum & wastage
 *
 *   The KEY fix vs. the old model: the conductor weight now multiplies by the number of
 *   cores, and adds the reduced neutral for 3.5C. A 4-core 240 really does carry ~4× the
 *   metal of a 1-core 240, so it must cost ~4× the conductor — the old formula ignored cores.
 *
 *   base cost/m = conductor + insulation + armour + sheath + labour
 *   subtotal    = base cost/m × length
 *   margin      = subtotal × margin%
 *   line total  = round(subtotal + margin)
 *
 * The weight COEFFICIENTS below are engineering estimates so a quote is realistic without a
 * full IS dimensional table. They are deliberately easy to tune from real production data.
 */
import type { CableSpec, ConductorMaterial, Material } from "@/lib/services/types";

/** Aluminium home-state code (Maharashtra). IGST applies when the customer is in another state. */
export const OUR_STATE_CODE = "27";
/** Lines below this margin trip the owner approval gate. */
export const MARGIN_GATE_PCT = 12;
/** HSN 8544 GST rate (flat 18% as of 2026). */
export const GST_RATE_PCT = 18;

/**
 * Conductor weight: kg/m per sq mm of cross-section, per core.
 * (Density-derived: Cu ≈ 8.9 g/cm³ → 0.0089–0.0092; Al ≈ 2.7 → 0.0027–0.00325 with stranding.)
 */
const CONDUCTOR_KG_PER_M_PER_SQMM: Record<ConductorMaterial, number> = {
  Copper: 0.0092,
  Aluminium: 0.00325,
};

/** How many "full" cores a core-config represents for conductor weight (3.5C = 3 full + 1 half). */
function coreCount(spec: Pick<CableSpec, "cores">): number {
  switch (spec.cores) {
    case "1C": return 1;
    case "2C": return 2;
    case "3C": return 3;
    case "3.5C": return 3; // the 0.5 neutral is added separately from neutralSizeSqMm
    case "4C": return 4;
    case "5C": return 5;
    case "7C": return 7;
    case "12C": return 12;
    case "19C": return 19;
    case "27C": return 27;
    case "37C": return 37;
    default: return 1;
  }
}

/** Rough non-conductor weight coefficients (kg/m), scaled by conductor size. Tunable. */
const INSULATION_KG_PER_M_PER_SQMM = 0.0011; // insulation wall grows with conductor size
const SHEATH_KG_PER_M_PER_SQMM = 0.0009; // outer sheath, scaled by overall size
const ARMOUR_KG_PER_M_PER_SQMM = 0.0016; // strip/wire armour, only when armoured
const DEFAULT_LABOUR_PER_M = 18; // drawing + extrusion + armouring + test + drum + wastage

/** Per-component ₹/kg rates the costing needs. Pulled from the Materials table by the caller. */
export interface MaterialRates {
  conductorPerKg: number; // for this spec's metal
  insulationPerKg: number;
  armourPerKg: number;
  sheathPerKg: number;
  labourPerM?: number; // optional override of the flat labour add-on
}

/**
 * Resolve the four ₹/kg rates a spec needs from the Materials table.
 * Conductor matches by metal; insulation/armour/sheath pick a sensible row by spec values,
 * falling back to the first row in that category. Returns 0-rate if a category is missing
 * so costing never throws.
 */
export function ratesForSpec(
  spec: Pick<CableSpec, "conductorMaterial" | "insulation" | "armour" | "sheath">,
  materials: Material[],
): MaterialRates {
  const byCategory = (category: Material["category"]) =>
    materials.filter((m) => m.category === category);

  const conductor =
    byCategory("Conductor").find((m) => m.matchMaterial === spec.conductorMaterial) ??
    byCategory("Conductor")[0];

  const insulation =
    byCategory("Insulation").find((m) =>
      spec.insulation === "XLPE" ? m.name.includes("XLPE") : m.name.includes("PVC"),
    ) ?? byCategory("Insulation")[0];

  const armour =
    byCategory("Armour").find((m) =>
      spec.armour.includes("Aluminium") ? m.name.includes("Aluminium") : m.name.includes("GI"),
    ) ?? byCategory("Armour")[0];

  const sheath =
    byCategory("Sheath").find((m) =>
      spec.sheath.includes("halogen") || spec.sheath.includes("LSZH")
        ? m.name.includes("LSZH")
        : m.name.includes("PVC"),
    ) ?? byCategory("Sheath")[0];

  return {
    conductorPerKg: conductor?.ratePerKg ?? 0,
    insulationPerKg: insulation?.ratePerKg ?? 0,
    armourPerKg: armour?.ratePerKg ?? 0,
    sheathPerKg: sheath?.ratePerKg ?? 0,
  };
}

export interface CostingInput {
  spec: Pick<
    CableSpec,
    "cores" | "conductorMaterial" | "conductorSizeSqMm" | "neutralSizeSqMm" | "armour"
  >;
  lengthM: number;
  marginPct: number;
  rates: MaterialRates;
}

/** One row of the per-component breakdown, so the UI can show exactly where the cost comes from. */
export interface CostComponent {
  label: string;
  kgPerM: number; // weight contribution (0 for labour)
  ratePerKg: number; // ₹/kg (0 for labour)
  costPerM: number; // ₹/m for this component
}

export interface CostingResult {
  components: CostComponent[];
  conductorCostPerM: number;
  baseCostPerM: number; // sum of all components
  lineSubtotalInr: number;
  lineMarginInr: number;
  lineTotalInr: number;
  totalConductorKgPerM: number; // handy for drum/logistics later
}

/** Costing for a single quote line, broken down by physical component. Pure. */
export function computeLine(input: CostingInput): CostingResult {
  const { spec, lengthM, marginPct, rates } = input;
  const size = spec.conductorSizeSqMm;
  const metalFactor = CONDUCTOR_KG_PER_M_PER_SQMM[spec.conductorMaterial];

  // ── Conductor: full cores + reduced neutral (3.5C) ──
  const fullCores = coreCount(spec);
  const fullCoresKgPerM = size * metalFactor * fullCores;
  const neutralKgPerM =
    spec.cores === "3.5C" && spec.neutralSizeSqMm
      ? spec.neutralSizeSqMm * metalFactor
      : 0;
  const totalConductorKgPerM = fullCoresKgPerM + neutralKgPerM;
  const conductorCostPerM = totalConductorKgPerM * rates.conductorPerKg;

  // ── Non-conductor components (scaled by size; armour only when armoured) ──
  const isArmoured = spec.armour !== "Unarmoured";
  const insulationKgPerM = size * INSULATION_KG_PER_M_PER_SQMM * fullCores;
  const armourKgPerM = isArmoured ? size * ARMOUR_KG_PER_M_PER_SQMM : 0;
  const sheathKgPerM = size * SHEATH_KG_PER_M_PER_SQMM;
  const labourPerM = rates.labourPerM ?? DEFAULT_LABOUR_PER_M;

  const components: CostComponent[] = [
    {
      label: `Conductor (${spec.cores} ${spec.conductorMaterial})`,
      kgPerM: totalConductorKgPerM,
      ratePerKg: rates.conductorPerKg,
      costPerM: conductorCostPerM,
    },
    {
      label: "Insulation",
      kgPerM: insulationKgPerM,
      ratePerKg: rates.insulationPerKg,
      costPerM: insulationKgPerM * rates.insulationPerKg,
    },
    ...(isArmoured
      ? [
          {
            label: "Armour",
            kgPerM: armourKgPerM,
            ratePerKg: rates.armourPerKg,
            costPerM: armourKgPerM * rates.armourPerKg,
          },
        ]
      : []),
    {
      label: "Sheath",
      kgPerM: sheathKgPerM,
      ratePerKg: rates.sheathPerKg,
      costPerM: sheathKgPerM * rates.sheathPerKg,
    },
    { label: "Labour & overhead", kgPerM: 0, ratePerKg: 0, costPerM: labourPerM },
  ];

  const baseCostPerM = components.reduce((sum, c) => sum + c.costPerM, 0);
  const lineSubtotalInr = baseCostPerM * lengthM;
  const lineMarginInr = lineSubtotalInr * (marginPct / 100);

  return {
    components,
    conductorCostPerM,
    baseCostPerM,
    lineSubtotalInr,
    lineMarginInr,
    lineTotalInr: Math.round(lineSubtotalInr + lineMarginInr),
    totalConductorKgPerM,
  };
}

export interface GstSplit {
  interstate: boolean;
  gstInr: number;
  igstInr?: number;
  cgstInr?: number;
  sgstInr?: number;
}

/** GST is IGST when the customer state differs from ours, else CGST 9% + SGST 9%. */
export function computeGst(subtotalInr: number, customerStateCode?: string): GstSplit {
  const gstInr = Math.round(subtotalInr * (GST_RATE_PCT / 100));
  const interstate = customerStateCode !== OUR_STATE_CODE;
  if (interstate) {
    return { interstate, gstInr, igstInr: gstInr };
  }
  const half = Math.round(gstInr / 2);
  return { interstate, gstInr, cgstInr: half, sgstInr: gstInr - half };
}
