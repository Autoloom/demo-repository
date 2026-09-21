/**
 * Aerial Bunched Cable (ABC) — domain model, standards resolution, and weights.
 *
 * WHY THIS FILE EXISTS
 * The original `CableSpec` (lib/services/types.ts) models ONE cable family: standard
 * armoured LT/HT cable (IS 1554 / IS 7098 territory — armour, inner/outer sheath,
 * flame class, one conductor size across N cores). That model cannot express an
 * aerial bunched cable, where each core is a DIFFERENT size and a different kind of
 * thing: 3 × 70 power + 1 × 50 neutral-cum-messenger + 1 × 16 street-lighting.
 *
 * So `cable family` is a real branch in the schema, not a flag on one giant object:
 *   - ARMOURED_LT_HT      → CableSpec            (existing, untouched)
 *   - ABC_AERIAL_BUNCHED  → AbcCableSpec         (this file)
 * Use `isAbcSpec()` to discriminate. Adding a third family means adding a third type
 * plus a STANDARDS_BY_FAMILY entry — no edits to the existing two.
 *
 * SOURCE OF TRUTH
 * Every field below is taken from a real approved GTP:
 *   "APPROVED GTP KRYFS PKG-30, 31-36 3x70.pdf" — WBSEDCL / RDSS Project-II,
 *   turnkey KRYFS Power Components, manufacturer Navya Cables & Conductor Pvt Ltd.
 * Nothing here is invented to fill a gap. Where the GTP carries a qualifier ("Min",
 * "before compacting", "± 3%") the model carries it too — see SpecValue.
 */

import { CONDUCTOR_KG_PER_M_PER_SQMM } from "@/lib/domain/costing";
import type { CostComponent, CostingResult, MaterialRates } from "@/lib/domain/costing";
import type { ConductorMaterial } from "@/lib/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Cable families
// ─────────────────────────────────────────────────────────────────────────────

export type CableFamily = "ARMOURED_LT_HT" | "ABC_AERIAL_BUNCHED";

/**
 * Applicable standards are a FUNCTION OF FAMILY, not a fixed list — an ABC cable
 * cites IS 14255 and IS 398(P-4) (alloy messenger wire), which never apply to a
 * standard armoured cable, and vice versa.
 *
 * Years are part of the citation: the GTP writes "IS 14255/1995", not "IS 14255".
 * Approvers check the year, so we store it.
 */
export const STANDARDS_BY_FAMILY: Record<CableFamily, readonly string[]> = {
  ABC_AERIAL_BUNCHED: [
    "IS 14255/1995", // aerial bunched cables for working voltages up to 1100 V
    "IS 398 (P-4)/94", // aluminium alloy stranded conductors (the messenger)
    "IS 8130/2013", // conductors for insulated electric cables
    "IS 10418/1982", // drums for electric cables
    "IS 10810/1984", // methods of test for cables
  ],
  // Deliberately NOT populated from guesswork. The armoured family's standards are
  // already enumerated as CableStandard in lib/services/types.ts and are picked
  // per-spec there (IS 7098-1/-2, IS 1554-1, IS 694, IEC 60502-x).
  ARMOURED_LT_HT: [],
} as const;

/** The GTP prints this verbatim after the standards list. */
export const STANDARDS_AMENDMENT_NOTE = "With latest Amendments.";

// ─────────────────────────────────────────────────────────────────────────────
// SpecValue — a number the way a GTP actually states it
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GTP values are rarely bare numbers. The real document says things like:
 *   "Min 2.17 mm (Before Compacting)"      → qualifier + note
 *   "9.44 (Tolerance: + 5%)"               → asymmetric, plus-only
 *   "7.98 mm (± 5%)"                       → symmetric
 *   "196 Kg/Km ± 3%"                       → symmetric on a mass
 *   "63 Amp/As per IS"                     → number with a fallback clause
 *
 * Storing these as plain floats loses the qualifier, and the qualifier is the part
 * an inspector checks. So we keep the number machine-readable AND reproduce the
 * printed form exactly via formatSpecValue().
 */
export interface SpecValue {
  value: number;
  unit?: string;
  /** Symmetric tolerance, e.g. 5 → "± 5%". Mutually exclusive with plus/minus. */
  tolerancePct?: number;
  /** Asymmetric upper tolerance, e.g. 5 → "+ 5%" (power core dia is plus-only). */
  tolerancePlusPct?: number;
  /** Asymmetric lower tolerance. */
  toleranceMinusPct?: number;
  qualifier?: "Min" | "Max" | "Approx" | "Nominal";
  /** Free-text rider the GTP prints, e.g. "Before Compacting", "As per IS". */
  note?: string;
}

/** Reproduce the GTP's printed form of a value. Pure; safe for the document renderer. */
export function formatSpecValue(v: SpecValue): string {
  const parts: string[] = [];
  if (v.qualifier) parts.push(v.qualifier);
  parts.push(String(v.value));
  if (v.unit) parts.push(v.unit);

  let out = parts.join(" ");

  if (v.tolerancePct !== undefined) {
    out += ` (± ${v.tolerancePct}%)`;
  } else if (v.tolerancePlusPct !== undefined || v.toleranceMinusPct !== undefined) {
    const plus = v.tolerancePlusPct !== undefined ? `+ ${v.tolerancePlusPct}%` : "";
    const minus = v.toleranceMinusPct !== undefined ? `− ${v.toleranceMinusPct}%` : "";
    out += ` (Tolerance: ${[plus, minus].filter(Boolean).join(" / ")})`;
  }

  if (v.note) out += ` (${v.note})`;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cores — branch again, because core types are not interchangeable
// ─────────────────────────────────────────────────────────────────────────────

export type AbcCoreType = "POWER" | "NEUTRAL_MESSENGER" | "STREET_LIGHTING";

/**
 * Insulated or bare neutral-cum-messenger. Both are IS 14255 constructions; the choice
 * changes weight, overall diameter and which GTP rows apply.
 */
export type MessengerCovering = "Insulated" | "Bare";

/** Fields every ABC core states, regardless of what the core is for. */
interface AbcCoreBase {
  numCores: number;
  nominalCsaSqMm: number;
  numStrands: number;
  /** Strand dia BEFORE compacting — the GTP is explicit about this. */
  strandDiaMm: SpecValue;
  compactedConductorDiaMm: SpecValue;
  insulationMinThicknessMm: SpecValue;
  approxDiaOverInsulationMm: SpecValue;
  /** Rating is quoted in air at a stated ambient — carry the ambient, don't assume 40 °C. */
  continuousCurrentRatingAmp: SpecValue;
  currentRatingAmbientTempC: number;
  maxDcResistanceOhmPerKm: number;
  /**
   * Approved mass of the CONDUCTOR METAL ONLY (not the insulated core).
   * The GTP qualifies whose metal: "only for EC grade Aluminium part" on power and
   * street-light cores, "only for Alloy part" on the messenger. This is the figure
   * costing should trust over any generic density coefficient — see abcConductorKgPerM.
   */
  approxConductorMassKgPerKm: SpecValue;
  /** How this core is told apart on the drum — or explicitly that it isn't. */
  identification: string;
}

export interface AbcPowerCore extends AbcCoreBase {
  coreType: "POWER";
}

export interface AbcMessengerCore extends AbcCoreBase {
  coreType: "NEUTRAL_MESSENGER";
  /** Mechanical properties only the load-bearing messenger states. */
  minBreakingLoadKn: number;
  modulusOfElasticityKgPerCm2: number; // GTP prints × 10^6
  coefficientLinearExpansionPerC: number; // GTP prints × 10^-6
}

export interface AbcStreetLightingCore extends AbcCoreBase {
  coreType: "STREET_LIGHTING";
}

export type AbcCore = AbcPowerCore | AbcMessengerCore | AbcStreetLightingCore;

// ─────────────────────────────────────────────────────────────────────────────
// The ABC spec
// ─────────────────────────────────────────────────────────────────────────────

export interface AbcRawMaterialSupplier {
  material: string;
  /** GTPs approve a SET of makes ("NALCO / BALCO / HINDALCO / Any Reputed Make"). */
  approvedMakes: string[];
}

export interface AbcCableSpec {
  family: "ABC_AERIAL_BUNCHED";
  id: string;

  /** Printed size string, e.g. "3CX70+1CX50+1CX16 Sqmm". Generated by buildAbcSize(). */
  size: string;
  designation: string;

  cores: AbcCore[];

  conductorMaterialGrade: string; // "H4 grade per IS 8130-1984"
  conductorMaterial: ConductorMaterial;
  flexibilityClass: string; // "Class-2"
  conductorForm: string; // "Strand Compacted Circular"
  maxContinuousConductorTempC: number;
  maxShortCircuitConductorTempC: number;

  messengerMaterial: string;
  messengerConductorForm: string;

  /**
   * Whether the neutral-cum-messenger is insulated or bare.
   *
   * Client request, Sept 2026: "option of Bare messenger shall also be provided
   * accordingly other parameter viz. Dimensions / Weight will also change." IS 14255
   * covers both constructions, and the choice is genuinely structural rather than
   * cosmetic — a bare messenger removes an insulation wall, so the cable gets lighter
   * and thinner, and the messenger's insulation rows stop applying.
   *
   * The source GTP is an insulated-messenger cable ("Insulated Messenger Conductor with
   * 4 Nos ridges"), so `Insulated` is what the approved spec carries. Switching to
   * `Bare` is a deviation from that approval, and the builder treats it as one.
   */
  messengerCovering: MessengerCovering;

  insulationMaterial: string;
  insulationApplicationMethod: string;
  insulationCuringType: string;
  insulationColour: string;

  serviceVoltageV: number;
  neutralToPhaseVoltageV: number;

  /** Air temperature → rating factor. Reproduced as approved, not recomputed. */
  deratingTable: { airTempC: number; ratingFactor: number }[];
  deratingNote?: string;

  directionOfLaying: string;

  completedCable: {
    approxOverallDiaMm: SpecValue;
    approxWeightKgPerKm: SpecValue;
    allowableSagPctAt40C: SpecValue;
  };

  drum: {
    standardLengthM: SpecValue;
    dimensionStandard: string;
    shippingWeight: string;
    /** IS 10148 governs drum MARKING; IS 10418 governs drum dimensions. Not the same standard. */
    markingStandard: string;
    markingContent: string;
  };

  sequentialMarking: string;
  embossingContent: string;
  cableIdentification: string;

  /**
   * "Multiplying factor considering Lay ratio of Cable to Measure the length of cable
   * in drum" (GTP item 16). Cores are laid helically, so conductor length ≠ drum length.
   * Applied when reconciling drum length against cable length.
   */
  layRatioMultiplyingFactor: number;

  rawMaterialSuppliers: AbcRawMaterialSupplier[];

  isiLicenceValidTillOrderComplete: boolean;
  guaranteeTerms: string;
  extras?: string;

  complianceChecklist: { item: string; required: boolean }[];
  notes?: string[];
}

/** Discriminate an ABC spec from the existing armoured CableSpec. */
export function isAbcSpec(spec: unknown): spec is AbcCableSpec {
  return (
    typeof spec === "object" &&
    spec !== null &&
    (spec as { family?: string }).family === "ABC_AERIAL_BUNCHED"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Designation
// ─────────────────────────────────────────────────────────────────────────────

const CORE_TYPE_ORDER: Record<AbcCoreType, number> = {
  POWER: 0,
  NEUTRAL_MESSENGER: 1,
  STREET_LIGHTING: 2,
};

/**
 * Canonical printed size, e.g. "3CX70+1CX50+1CX16 Sqmm".
 *
 * Worth knowing: the source GTP is internally inconsistent — its title says
 * "3 X 70 + 16 + 50 SQ.MM" while its size field says "3CX70+1CX50+1CX16 Sqmm"
 * (street-light and messenger swapped). We always emit power → messenger →
 * street-lighting so the app never reproduces that ambiguity.
 */
export function buildAbcSize(cores: AbcCore[]): string {
  return [...cores]
    .sort((a, b) => CORE_TYPE_ORDER[a.coreType] - CORE_TYPE_ORDER[b.coreType])
    .map((c) => `${c.numCores}CX${c.nominalCsaSqMm}`)
    .join("+")
    .concat(" Sqmm");
}

export function buildAbcDesignation(spec: Pick<AbcCableSpec, "cores" | "serviceVoltageV">): string {
  const size = buildAbcSize(spec.cores);
  const hasMessenger = spec.cores.some((c) => c.coreType === "NEUTRAL_MESSENGER");
  const kv = (spec.serviceVoltageV / 1000).toFixed(1).replace(/\.0$/, "");
  return `LT AB Cable ${size}, XLPE, ${kv} kV${hasMessenger ? " (covered messenger)" : ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Weights
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Conductor metal weight for one core group, kg/m.
 *
 * Prefers the GTP's APPROVED mass over the generic coefficient, and the gap is not
 * academic: this cable's approved power-core mass is 196 kg/km at 70 sq mm
 * (≈ 0.0028 kg/m/sq mm), while the generic aluminium coefficient is 0.00325 — about
 * 16% heavier. Costing off the generic number would overstate metal on every drum.
 * When a figure has been approved by the DISCOM, that figure is the truth.
 */
export function abcConductorKgPerM(core: AbcCore, material: ConductorMaterial): number {
  const approvedKgPerKm = core.approxConductorMassKgPerKm?.value;
  const perCoreKgPerM =
    approvedKgPerKm && approvedKgPerKm > 0
      ? approvedKgPerKm / 1000
      : core.nominalCsaSqMm * CONDUCTOR_KG_PER_M_PER_SQMM[material];
  return perCoreKgPerM * core.numCores;
}

/** Total conductor metal across every core, kg/m. */
export function abcTotalConductorKgPerM(spec: AbcCableSpec): number {
  return spec.cores.reduce((sum, c) => sum + abcConductorKgPerM(c, spec.conductorMaterial), 0);
}

/**
 * Non-metal weight (insulation + binder), kg/m.
 *
 * Derived, not guessed: the GTP approves a completed-cable mass (966 kg/km) and a
 * per-core conductor mass. The difference is everything that isn't conductor. If the
 * completed mass is absent we return 0 rather than inventing a coefficient — an
 * understated cost is easier to spot than a fabricated one.
 */
export function abcInsulationKgPerM(spec: AbcCableSpec): number {
  const completed = spec.completedCable?.approxWeightKgPerKm?.value;
  if (!completed || completed <= 0) return 0;
  const diff = completed / 1000 - abcTotalConductorKgPerM(spec);
  const insulated = diff > 0 ? diff : 0;
  // A bare messenger carries no insulation, so its wall comes off the total.
  return Math.max(0, insulated - abcMessengerInsulationKgPerM(spec));
}

/** XLPE density, expressed as kg per metre per mm² of cross-section (0.92 g/cm³). */
const XLPE_KG_PER_M_PER_SQMM = 0.00092;

/**
 * Weight of the insulation wall on the messenger core, kg/m — the amount a bare
 * messenger saves. Returns 0 when the messenger is already insulated, absent, or when
 * its geometry is not stated.
 *
 * Derived from the messenger's own approved geometry (compacted conductor diameter and
 * minimum insulation thickness), not from a coefficient: the wall is an annulus of area
 * π(d + t)t, and XLPE is 0.92 g/cm³. Nothing here is invented — if either figure is
 * missing the answer is 0 and the UI says the saving is unquantified.
 */
export function abcMessengerInsulationKgPerM(spec: AbcCableSpec): number {
  if (spec.messengerCovering !== "Bare") return 0;
  const messenger = spec.cores.find((c) => c.coreType === "NEUTRAL_MESSENGER");
  if (!messenger) return 0;

  const d = messenger.compactedConductorDiaMm?.value ?? 0;
  const t = messenger.insulationMinThicknessMm?.value ?? 0;
  if (d <= 0 || t <= 0) return 0;

  return Math.PI * (d + t) * t * XLPE_KG_PER_M_PER_SQMM * messenger.numCores;
}

/**
 * Completed-cable weight after the messenger covering is taken into account, kg/km.
 *
 * The GTP's approved 966 kg/km is for an INSULATED messenger. Choosing a bare messenger
 * means the approved figure no longer describes the cable, so we state the derived one
 * and the builder flags it as a deviation rather than reprinting an approved number
 * against a cable it was not approved for.
 */
export function abcCompletedWeightKgPerKm(spec: AbcCableSpec): number {
  const approved = spec.completedCable?.approxWeightKgPerKm?.value ?? 0;
  if (approved <= 0) return 0;
  return approved - abcMessengerInsulationKgPerM(spec) * 1000;
}

/**
 * How much thinner the messenger core is when bare, mm — twice its insulation wall.
 *
 * Stated on the messenger rather than rolled into an overall-diameter figure: the
 * bundle's overall diameter depends on how the cores lay up around the messenger, and
 * we have no approved lay-up geometry for ABC. The messenger's own reduction is exact;
 * a recomputed bundle diameter would not be.
 */
export function abcMessengerDiaReductionMm(spec: AbcCableSpec): number {
  if (spec.messengerCovering !== "Bare") return 0;
  const messenger = spec.cores.find((c) => c.coreType === "NEUTRAL_MESSENGER");
  return 2 * (messenger?.insulationMinThicknessMm?.value ?? 0);
}

/**
 * Drum length → conductor length, using the GTP's lay-ratio factor (item 16).
 * Cores are laid helically around the messenger, so a 1000 m drum does not contain
 * 1000 m of conductor.
 */
export function abcConductorLengthM(spec: AbcCableSpec, drumLengthM: number): number {
  const factor = spec.layRatioMultiplyingFactor || 1;
  return drumLengthM * factor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Costing
// ─────────────────────────────────────────────────────────────────────────────

export interface AbcCostingInput {
  spec: AbcCableSpec;
  lengthM: number;
  marginPct: number;
  rates: MaterialRates;
  /**
   * Scrap / wastage uplift on MATERIAL weight only (never on labour).
   *
   * Defaults to 0 deliberately. The repo's standing rule is not to hardcode an assumed
   * scrap factor before the production supervisor confirms the real one — so this is an
   * explicit input the user types, not a number the engine invents. 0 means "not yet
   * known", which is honest; a made-up 3% would silently inflate every quote.
   */
  wastagePct?: number;
}

/**
 * Cost one ABC line, returning the SAME CostingResult shape as computeLine() so the
 * existing breakdown UI renders either family without branching.
 *
 * Deliberately reuses the existing engine's conventions (per-component weight × ₹/kg,
 * flat labour add-on, margin as a percentage of subtotal, ₹ rounding at line total).
 * No working-capital term: the repo's costing model is authoritative here, and it has
 * no such concept — see the assumptions note in CLAUDE.md.
 *
 * The ABC difference is structural, not arithmetic: each core group is priced on its
 * own approved mass and size, because the cores are genuinely different cables
 * (3 × 70 power, 1 × 50 alloy messenger, 1 × 16 street-lighting). There is no armour
 * and no overall outer sheath — an ABC bundle is insulated cores laid up bare.
 */
export function computeAbcLine(input: AbcCostingInput): CostingResult {
  const { spec, lengthM, marginPct, rates } = input;
  // Material weights carry the scrap uplift; labour does not (you don't pay a machine
  // operator twice for wasted metal).
  const wastageFactor = 1 + (input.wastagePct ?? 0) / 100;

  // One component row per core group, so the quote shows where the metal actually is.
  const conductorComponents: CostComponent[] = spec.cores.map((core) => {
    const kgPerM = abcConductorKgPerM(core, spec.conductorMaterial) * wastageFactor;
    return {
      label: `Conductor — ${coreTypeLabel(core.coreType)} (${core.numCores} × ${core.nominalCsaSqMm} sq mm)`,
      kgPerM,
      ratePerKg: rates.conductorPerKg,
      costPerM: kgPerM * rates.conductorPerKg,
    };
  });

  const insulationKgPerM = abcInsulationKgPerM(spec) * wastageFactor;
  const labourPerM = rates.labourPerM ?? DEFAULT_ABC_LABOUR_PER_M;

  const components: CostComponent[] = [
    ...conductorComponents,
    {
      label: "Insulation & lay-up",
      kgPerM: insulationKgPerM,
      ratePerKg: rates.insulationPerKg,
      costPerM: insulationKgPerM * rates.insulationPerKg,
    },
    { label: "Labour & overhead", kgPerM: 0, ratePerKg: 0, costPerM: labourPerM },
  ];

  const totalConductorKgPerM = abcTotalConductorKgPerM(spec);
  const conductorCostPerM = conductorComponents.reduce((sum, c) => sum + c.costPerM, 0);
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
    // ABC weights come from the GTP's approved masses where present, and the completed
    // mass is approved too — so this path is never the armoured family's coefficient
    // fallback. `abcInsulationKgPerM` returns 0 rather than guessing when it is absent.
    weightBasis: "calculated",
    totalWeightKgPerM: components.reduce((sum, c) => sum + c.kgPerM, 0),
  };
}

/** ABC skips armouring and outer sheathing, so its labour add-on sits below the armoured default. */
const DEFAULT_ABC_LABOUR_PER_M = 14;

/**
 * How a core type is named on the GTP and in the cost breakdown.
 *
 * "Phase (Conductor)" rather than "Power": client correction, Sept 2026 — "Replace
 * Power by Phase (Conductor)". The enum key stays `POWER` on purpose. It is the
 * discriminant on a union that the seed data, the deviation tracker and the per-core
 * editor all key off; renaming it would churn every one of those for a wording change
 * that belongs on the printed document. Label and key are allowed to differ — that is
 * what this function is for.
 */
export function coreTypeLabel(coreType: AbcCoreType): string {
  switch (coreType) {
    case "POWER":
      return "Phase (Conductor)";
    case "NEUTRAL_MESSENGER":
      return "Neutral-cum-messenger";
    case "STREET_LIGHTING":
      return "Street lighting";
  }
}
