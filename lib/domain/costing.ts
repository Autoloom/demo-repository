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
import type { CableDimensions } from "@/lib/domain/dimensions";
import type { CableSpec, ConductorMaterial, Insulation, Material } from "@/lib/services/types";

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
export const CONDUCTOR_KG_PER_M_PER_SQMM: Record<ConductorMaterial, number> = {
  Copper: 0.0092,
  Aluminium: 0.00325,
};

/**
 * How many "full" cores a core-config represents for conductor weight.
 *
 * Parsed rather than switched: the old switch listed each config by hand and fell
 * through to `1` for anything unlisted, so adding a core count to `CoreConfig` silently
 * costed it as single-core — a 16-core control cable priced at one core's metal. The
 * label is always "<n>C", so read the number.
 *
 * 3.5C returns 3; its reduced neutral is added separately from `neutralSizeSqMm`.
 */
function coreCount(spec: Pick<CableSpec, "cores">): number {
  if (spec.cores === "3.5C") return 3;
  const n = Number.parseInt(spec.cores, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Rough non-conductor weight coefficients (kg/m), scaled by conductor size. Tunable. */
const INSULATION_KG_PER_M_PER_SQMM = 0.0011; // insulation wall grows with conductor size
const SHEATH_KG_PER_M_PER_SQMM = 0.0009; // outer sheath, scaled by overall size
const ARMOUR_KG_PER_M_PER_SQMM = 0.0016; // strip/wire armour, only when armoured
const DEFAULT_LABOUR_PER_M = 18; // drawing + extrusion + armouring + test + drum + wastage

/**
 * Compound densities, g/cm³ — equivalently kg per metre per 1000 mm² of cross-section.
 * Used only on the geometry path, where a real annulus area is available to multiply.
 */
const DENSITY_G_PER_CM3 = {
  XLPE: 0.92,
  PVC: 1.4,
} as const;

/** g/cm³ → kg per metre per mm² of cross-section. */
const kgPerMPerSqMm = (gPerCm3: number) => gPerCm3 / 1000;

/** Area of an annulus of wall thickness `t` applied over diameter `d`, mm². */
function annulusAreaSqMm(dMm: number, tMm: number): number {
  return Math.PI * (dMm + tMm) * tMm;
}

function insulationDensity(insulation?: Insulation): number {
  return insulation === "XLPE" ? DENSITY_G_PER_CM3.XLPE : DENSITY_G_PER_CM3.PVC;
}

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
  > & { insulation?: Insulation };
  lengthM: number;
  marginPct: number;
  rates: MaterialRates;
  /**
   * The dimensional build-up, when one could be calculated (see domain/dimensions.ts).
   *
   * When present, insulation / armour / sheath weights come from real annulus areas and
   * the armour's own geometry instead of coefficients keyed to the conductor size. This
   * is what makes "change the armour and the weight changes" true — under the
   * coefficient path, swapping wire for strip moved nothing, because the coefficient
   * never knew what the armour was.
   *
   * Absent, costing falls back to the original coefficients, and `weightBasis` says so
   * rather than letting an estimate pass for a calculation.
   */
  dimensions?: CableDimensions | null;
}

/** One row of the per-component breakdown, so the UI can show exactly where the cost comes from. */
export interface CostComponent {
  label: string;
  kgPerM: number; // weight contribution (0 for labour)
  ratePerKg: number; // ₹/kg (0 for labour)
  costPerM: number; // ₹/m for this component
}

/**
 * Where the non-conductor weights came from. Shown in the UI, because a quote built on
 * a generic coefficient must not look identical to one built from real geometry.
 */
export type WeightBasis =
  /** Annulus areas and armour geometry, off the standard's dimension tables. */
  | "calculated"
  /** The original density coefficients keyed to conductor size. */
  | "estimated";

export interface CostingResult {
  components: CostComponent[];
  conductorCostPerM: number;
  baseCostPerM: number; // sum of all components
  lineSubtotalInr: number;
  lineMarginInr: number;
  lineTotalInr: number;
  totalConductorKgPerM: number; // handy for drum/logistics later
  weightBasis: WeightBasis;
  /** Total cable weight, kg/m — only meaningful on the calculated path. */
  totalWeightKgPerM: number;
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

  // ── Non-conductor components ──
  // Two paths. With a dimensional build-up, every wall is a real annulus and the armour
  // brings its own steel area; without one, we fall back to the original coefficients.
  const isArmoured = spec.armour !== "Unarmoured";
  const dims = input.dimensions ?? null;
  const weightBasis: WeightBasis = dims ? "calculated" : "estimated";

  let insulationKgPerM: number;
  let armourKgPerM: number;
  let sheathKgPerM: number;
  let insulationLabel = "Insulation";
  let armourLabel = "Armour";
  let sheathLabel = "Sheath";

  if (dims) {
    // Insulation: one annulus per core, over the conductor. The reduced neutral is a
    // smaller conductor but carries the same wall, so it is counted as a full core here.
    const insulatedCores = spec.cores === "3.5C" ? fullCores + 1 : fullCores;
    const insulationAreaSqMm =
      annulusAreaSqMm(dims.conductorDiaMm, dims.insulationThicknessMm) * insulatedCores;
    insulationKgPerM = insulationAreaSqMm * kgPerMPerSqMm(insulationDensity(spec.insulation));
    insulationLabel = `Insulation (${insulatedCores} × ${dims.insulationThicknessMm} mm wall)`;

    // Inner sheath is PVC over the laid-up cores — a real component the old model never
    // costed at all.
    const innerSheathAreaSqMm =
      dims.innerSheathThicknessMm > 0
        ? annulusAreaSqMm(dims.laidUpDiaMm, dims.innerSheathThicknessMm)
        : 0;

    armourKgPerM = dims.armour?.kgPerM ?? 0;
    if (dims.armour && dims.armourDims) {
      armourLabel =
        dims.armourDims.kind === "strip"
          ? `Armour — ${dims.armour.count} × GI strip ${dims.armourDims.widthMm} × ${dims.armourDims.thicknessMm} mm`
          : `Armour — ${dims.armour.count} × GI wire Ø ${dims.armourDims.diameterMm} mm`;
    }

    const outerSheathAreaSqMm = annulusAreaSqMm(
      dims.diaUnderOuterSheathMm,
      dims.outerSheathThicknessMm,
    );
    sheathKgPerM =
      (innerSheathAreaSqMm + outerSheathAreaSqMm) * kgPerMPerSqMm(DENSITY_G_PER_CM3.PVC);
    sheathLabel =
      innerSheathAreaSqMm > 0
        ? `Sheath (inner ${dims.innerSheathThicknessMm} mm + outer ${dims.outerSheathThicknessMm} mm)`
        : `Sheath (outer ${dims.outerSheathThicknessMm} mm)`;
  } else {
    insulationKgPerM = size * INSULATION_KG_PER_M_PER_SQMM * fullCores;
    armourKgPerM = isArmoured ? size * ARMOUR_KG_PER_M_PER_SQMM : 0;
    sheathKgPerM = size * SHEATH_KG_PER_M_PER_SQMM;
  }

  const labourPerM = rates.labourPerM ?? DEFAULT_LABOUR_PER_M;

  const components: CostComponent[] = [
    {
      label: `Conductor (${spec.cores} ${spec.conductorMaterial})`,
      kgPerM: totalConductorKgPerM,
      ratePerKg: rates.conductorPerKg,
      costPerM: conductorCostPerM,
    },
    {
      label: insulationLabel,
      kgPerM: insulationKgPerM,
      ratePerKg: rates.insulationPerKg,
      costPerM: insulationKgPerM * rates.insulationPerKg,
    },
    ...(isArmoured
      ? [
          {
            label: armourLabel,
            kgPerM: armourKgPerM,
            ratePerKg: rates.armourPerKg,
            costPerM: armourKgPerM * rates.armourPerKg,
          },
        ]
      : []),
    {
      label: sheathLabel,
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
    weightBasis,
    totalWeightKgPerM: components.reduce((sum, c) => sum + c.kgPerM, 0),
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
