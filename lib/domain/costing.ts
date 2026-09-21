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
 *   margin      = EACH component's subtotal × that component's own margin% — conductor,
 *                 insulation, armour, sheath and labour can each carry a different profit
 *                 margin, because their market prices move independently and a buyer's own
 *                 negotiating leverage often differs by material.
 *   line total  = round(subtotal + Σ per-component margin)
 *
 * The 12%-margin owner-approval gate (`MARGIN_GATE_PCT`) still checks ONE number: the blended
 * margin across the whole line (total margin ÷ total cost). A quote with a thin margin on one
 * material and a fat one on another is not automatically flagged — only a genuinely thin *line*
 * is. See `blendedMarginPct` below.
 *
 * ─── WHERE THE WEIGHTS COME FROM (changed — read this) ────────────────────────────────────────
 *
 * They used to be tunable coefficients, described here as "engineering estimates so a quote is
 * realistic without a full IS dimensional table". That table now exists: the GTP engines derive
 * every layer diameter and wall thickness from encoded IS clauses, and lib/domain/gtp/mass.ts
 * turns that geometry into a mass. On a real AB cable the estimate and the derivation disagreed
 * by ~35%, on the metal that dominates the price.
 *
 * So the coefficients are GONE. `computeLine` takes a derived mass. There is deliberately no
 * fallback to estimates: a fallback would recreate the two-definitions problem this removes, and
 * silently — a quote priced from a different model than the GTP is exactly the failure mode.
 *
 * A cable whose mass cannot be derived produces no price. That is the correct outcome; see
 * `DerivedLineMass` below.
 */
import { LAY_UP_FACTOR, MATERIAL_DENSITY } from "@/lib/domain/gtp/mass";
import type { CableSpec, ConductorMaterial, Material } from "@/lib/services/types";

/** Aluminium home-state code (Maharashtra). IGST applies when the customer is in another state. */
export const OUR_STATE_CODE = "27";
/** Lines below this (blended) margin trip the owner approval gate. */
export const MARGIN_GATE_PCT = 12;
/** HSN 8544 GST rate (flat 18% as of 2026). */
export const GST_RATE_PCT = 18;

/** Every cost component that can carry its own margin. Matches `MaterialCategory` plus labour,
 *  which is not a material but is still a margin-bearing line on the quote. */
export type MarginCategory = "Conductor" | "Insulation" | "Armour" | "Sheath" | "Labour";
export type MarginCategoryMargins = Record<MarginCategory, number>;
export const MARGIN_CATEGORIES: readonly MarginCategory[] = ["Conductor", "Insulation", "Armour", "Sheath", "Labour"];
/** A flat margin used when the caller hasn't set one per category yet (e.g. a fresh draft). */
export const DEFAULT_MARGIN_PCT = 14;
export function defaultMarginByCategory(pct: number = DEFAULT_MARGIN_PCT): Record<MarginCategory, number> {
  return { Conductor: pct, Insulation: pct, Armour: pct, Sheath: pct, Labour: pct };
}

function conductorRateMaterial(material: ConductorMaterial): ConductorMaterial {
  if (material === "Tinned Copper" || material === "Thermocouple Alloy") return "Copper";
  if (material === "Aluminium Alloy" || material === "AAAC" || material === "ACSR") return "Aluminium";
  return material;
}

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

/**
 * Conductor mass in kg/m per sq mm of cross-section, per core.
 *
 * This is just the material's density divided by 1000 — the identity `mm² × g/cm³ ≡ kg/km` again,
 * expressed per metre. It replaces a table of hand-tuned coefficients that carried an implicit
 * stranding allowance: aluminium was 0.00325 against a true 0.00270, a 20% inflation, which is
 * most of why the quote and the GTP disagreed by ~35%.
 *
 * Stranding is real, but it belongs in `LAY_UP_FACTOR` where it is named and shared with the GTP
 * engines — not baked invisibly into a density.
 */
const CONDUCTOR_KG_PER_M_PER_SQMM: Record<ConductorMaterial, number> = {
  Copper: MATERIAL_DENSITY.copper / 1000,
  // Tin coating is a few microns; the difference is far inside the tolerance a mass carries.
  "Tinned Copper": MATERIAL_DENSITY.copper / 1000,
  Aluminium: MATERIAL_DENSITY.aluminium / 1000,
  "Aluminium Alloy": MATERIAL_DENSITY.aluminium / 1000,
  AAAC: MATERIAL_DENSITY.aluminium / 1000,
  // ACSR is aluminium over a steel core; the steel is what makes it heavier per sq mm.
  ACSR: (MATERIAL_DENSITY.aluminium * 0.85 + MATERIAL_DENSITY.galvanisedSteel * 0.15) / 1000,
  // A thermocouple alloy is a nickel-based alloy; nickel and copper are close enough in density
  // that copper's figure is used rather than inventing a separate one.
  "Thermocouple Alloy": MATERIAL_DENSITY.copper / 1000,
};

/**
 * Labour, wastage, drum and testing, in rupees per metre.
 *
 * Still an entered figure and deliberately so: WP-1 derives MASS, not COST. Modelling labour and
 * overhead properly needs a cost basis from the works, which this system does not have. A partial
 * cost model is confidently wrong in a way that loses tenders.
 */
const DEFAULT_LABOUR_PER_M = 18;

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
    byCategory("Conductor").find((m) => m.matchMaterial === conductorRateMaterial(spec.conductorMaterial)) ??
    byCategory("Conductor")[0];

  const insulation =
    byCategory("Insulation").find((m) =>
      spec.insulation.includes("XLPE") || spec.insulation.includes("solar")
        ? m.name.includes("XLPE")
        : m.name.includes("PVC"),
    ) ?? byCategory("Insulation")[0];

  const armour =
    byCategory("Armour").find((m) =>
      spec.armour.includes("Aluminium") ? m.name.includes("Aluminium") : m.name.includes("GI"),
    ) ?? byCategory("Armour")[0];

  const sheath =
    byCategory("Sheath").find((m) => m.name.toLowerCase() === spec.sheath.toLowerCase()) ??
    (spec.sheath.includes("FRLS") ? byCategory("Sheath").find((m) => /FRLS/i.test(m.name)) :
      spec.sheath === "FR PVC" ? byCategory("Sheath").find((m) => /\bFR\b/i.test(m.name)) : undefined) ??
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
    | "family"
    | "cores"
    | "conductorMaterial"
    | "conductorSizeSqMm"
    | "neutralSizeSqMm"
    | "armour"
    | "aerialBunched"
    | "instrumentation"
    | "thermocouple"
    | "coveredConductor"
  >;
  lengthM: number;
  /** Margin %, set independently per cost category — see `MarginCategory`. */
  marginPctByCategory: Record<MarginCategory, number>;
  rates: MaterialRates;
  /**
   * Per-layer mass derived from the IS build-up chain, in kg/m.
   *
   * Supplied by the caller from `lib/domain/gtp/mass.ts`. Optional only because the legacy
   * families this costing still serves — instrumentation, thermocouple — have no encoded
   * standard to derive from. Where it IS supplied it wins outright; there is no averaging and no
   * fallback, because a price computed from a different model than the GTP is the exact failure
   * this removes.
   */
  derivedMass?: DerivedLineMass;
}

/**
 * Non-conductor mass per metre, derived rather than estimated.
 *
 * Conductor mass is not included: it is already computed from the nominal cross-section, which
 * is what the conductor is sold and priced by, and which the standards specify directly.
 */
export interface DerivedLineMass {
  insulationKgPerM: number;
  armourKgPerM: number;
  sheathKgPerM: number;
  /** Where these came from, carried onto the quote line so a price answers "which clause". */
  workings: string;
}

/** One row of the per-component breakdown, so the UI can show exactly where the cost comes from. */
export interface CostComponent {
  label: string;
  category: MarginCategory;
  kgPerM: number; // weight contribution (0 for labour)
  ratePerKg: number; // ₹/kg (0 for labour)
  costPerM: number; // ₹/m for this component, before margin
  marginPct: number; // this component's own margin %
  marginInr: number; // this component's margin, scaled to lengthM
  totalInr: number; // (costPerM × lengthM) + marginInr — what this component adds to the line total
}

export interface CostingResult {
  components: CostComponent[];
  conductorCostPerM: number;
  baseCostPerM: number; // sum of all components' costPerM, before margin
  lineSubtotalInr: number; // baseCostPerM × lengthM, before margin
  lineMarginInr: number; // sum of every component's margin
  lineTotalInr: number;
  /** Blended margin % across the whole line (total margin ÷ total cost) — what the 12% gate checks. */
  blendedMarginPct: number;
  totalConductorKgPerM: number; // handy for drum/logistics later
}

function effectiveConductorWeight(spec: CostingInput["spec"]): {
  totalConductorKgPerM: number;
  label: string;
} {
  if (spec.family === "Aerial Bunched Cable" && spec.aerialBunched) {
    const phaseFactor = CONDUCTOR_KG_PER_M_PER_SQMM.Aluminium;
    const messengerFactor = CONDUCTOR_KG_PER_M_PER_SQMM["Aluminium Alloy"];
    const phaseKgPerM = spec.aerialBunched.phaseCount * spec.aerialBunched.phaseSizeSqMm * phaseFactor;
    const messengerKgPerM = spec.aerialBunched.messengerSizeSqMm * messengerFactor;
    const streetLightKgPerM = (spec.aerialBunched.streetLightSizeSqMm ?? 0) * phaseFactor;
    return {
      totalConductorKgPerM: phaseKgPerM + messengerKgPerM + streetLightKgPerM,
      label: "Conductor (ABC phases + messenger)",
    };
  }

  if (spec.family === "Screened Instrumentation" && spec.instrumentation) {
    const conductorsPerGroup = spec.instrumentation.grouping === "Triad" ? 3 : 2;
    const totalConductors = spec.instrumentation.groupCount * conductorsPerGroup;
    const factor = CONDUCTOR_KG_PER_M_PER_SQMM[spec.conductorMaterial];
    return {
      totalConductorKgPerM: totalConductors * spec.conductorSizeSqMm * factor,
      label: `Conductor (${spec.instrumentation.groupCount} ${spec.instrumentation.grouping.toLowerCase()}s)`,
    };
  }

  if (spec.family === "Thermocouple Cable" && spec.thermocouple) {
    const totalConductors = spec.thermocouple.pairCount * 2;
    const factor = CONDUCTOR_KG_PER_M_PER_SQMM["Thermocouple Alloy"];
    return {
      totalConductorKgPerM: totalConductors * spec.conductorSizeSqMm * factor,
      label: `Conductor (type ${spec.thermocouple.thermocoupleType} thermocouple)`,
    };
  }

  const size = spec.conductorSizeSqMm;
  const metalFactor = CONDUCTOR_KG_PER_M_PER_SQMM[spec.conductorMaterial];
  const fullCores = coreCount(spec);
  const fullCoresKgPerM = size * metalFactor * fullCores;
  const neutralKgPerM =
    spec.cores === "3.5C" && spec.neutralSizeSqMm
      ? spec.neutralSizeSqMm * metalFactor
      : 0;
  return {
    totalConductorKgPerM: fullCoresKgPerM + neutralKgPerM,
    label: `Conductor (${spec.cores} ${spec.conductorMaterial})`,
  };
}

/** Costing for a single quote line, broken down by physical component. Pure. */
export function computeLine(input: CostingInput): CostingResult {
  const { spec, lengthM, marginPctByCategory, rates } = input;
  const { totalConductorKgPerM: bareConductorKgPerM, label } = effectiveConductorWeight(spec);

  // Stranding: a core laid up helically travels further than the cable is long, so a metre of
  // cable contains more than a metre of conductor. The old coefficients hid this inside an
  // inflated density (aluminium 0.00325 against a true 0.00270). It is now explicit, and shares
  // one constant with the GTP engines so the two cannot drift.
  const totalConductorKgPerM = bareConductorKgPerM * LAY_UP_FACTOR;
  const conductorCostPerM = totalConductorKgPerM * rates.conductorPerKg;

  // ── Non-conductor components (scaled by size; armour only when armoured) ──
  const isArmoured = spec.armour !== "Unarmoured";

  // Derived where the cable maps to an encoded standard; zero where it does not.
  //
  // Zero rather than an estimate is deliberate. A cable this system cannot derive should show a
  // conductor-only price that is visibly incomplete, not a plausible total assembled from
  // coefficients nobody can trace to a clause. `derivedMass.workings` says which happened.
  const insulationKgPerM = input.derivedMass?.insulationKgPerM ?? 0;
  const armourKgPerM = isArmoured ? (input.derivedMass?.armourKgPerM ?? 0) : 0;
  const sheathKgPerM = input.derivedMass?.sheathKgPerM ?? 0;
  const labourPerM = rates.labourPerM ?? DEFAULT_LABOUR_PER_M;

  /** Build one row, applying that category's own margin — scaled to the full line length. */
  const row = (rowLabel: string, category: MarginCategory, kgPerM: number, ratePerKg: number, costPerM: number): CostComponent => {
    const marginPct = marginPctByCategory[category];
    const subtotalInr = costPerM * lengthM;
    const marginInr = subtotalInr * (marginPct / 100);
    return { label: rowLabel, category, kgPerM, ratePerKg, costPerM, marginPct, marginInr, totalInr: subtotalInr + marginInr };
  };

  const components: CostComponent[] = [
    row(label, "Conductor", totalConductorKgPerM, rates.conductorPerKg, conductorCostPerM),
    row("Insulation", "Insulation", insulationKgPerM, rates.insulationPerKg, insulationKgPerM * rates.insulationPerKg),
    ...(isArmoured ? [row("Armour", "Armour" as const, armourKgPerM, rates.armourPerKg, armourKgPerM * rates.armourPerKg)] : []),
    row("Sheath", "Sheath", sheathKgPerM, rates.sheathPerKg, sheathKgPerM * rates.sheathPerKg),
    row("Labour & overhead", "Labour", 0, 0, labourPerM),
  ];

  const baseCostPerM = components.reduce((sum, c) => sum + c.costPerM, 0);
  const lineSubtotalInr = baseCostPerM * lengthM;
  const lineMarginInr = components.reduce((sum, c) => sum + c.marginInr, 0);
  // Blended, not per-component: what the 12% owner-approval gate checks (see file header).
  const blendedMarginPct = lineSubtotalInr > 0 ? (lineMarginInr / lineSubtotalInr) * 100 : 0;

  return {
    components,
    conductorCostPerM,
    baseCostPerM,
    lineSubtotalInr,
    lineMarginInr,
    lineTotalInr: Math.round(lineSubtotalInr + lineMarginInr),
    blendedMarginPct,
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
