/**
 * Dimensional build-up for the armoured families (LT XLPE, LT PVC power, control).
 *
 * WHY THIS EXISTS
 * The client asked for strip armour on 3.5 core "and accordingly the dimensions /
 * weight will also change" (Laxmikant Shete, Daksha Cable, Sept 2026). That sentence
 * is only answerable if the app knows how thick the cable is — and until now it did
 * not. `CableSpec.approxOuterDiaMm` was an optional field nobody computed, and costing
 * scaled every non-conductor component off the CONDUCTOR size, so changing the armour
 * changed nothing.
 *
 * WHAT THIS IS
 * The layer-by-layer build-up, each thickness read from the governing standard's own
 * table rather than estimated:
 *
 *   conductor  →  + 2 × insulation      (IS 7098 P1 Table 3 / IS 1554 P1 Table 2)
 *              →  × lay-up factor        (assembly coefficient, IS 10462 P1)
 *              →  + 2 × inner sheath     (IS 7098 P1 Table 5)
 *              →  + armour               (IS 7098 P1 Table 6 — see armour.ts)
 *              →  + 2 × outer sheath     (IS 7098 P1 Table 8)
 *
 * THE "CALCULATED DIAMETER" IS A CONVENTION, NOT A MEASUREMENT
 * Every one of those tables is entered with a *calculated* diameter per IS 10462
 * (Part 1), the "fictitious calculation method" — each table above literally says so in
 * its column head. Under that method the conductor is taken as a solid circle of the
 * nominal area:
 *
 *     d = √(4A / π)
 *
 * So using that formula is not an approximation we invented to paper over a missing
 * table; it is the method the tables are designed to be read with. Real compacted
 * stranded conductors measure slightly over this, which is why the results are labelled
 * "calculated" and not "approved".
 *
 * WHAT IS DELIBERATELY NOT MODELLED
 * IS 10462 (Part 1) is not in our document set, so its assembly coefficients are only
 * carried for the core counts where the value is long-settled and unambiguous (1–7 plus
 * 3.5). Above 7 cores — control cables — `buildUpDimensions()` returns null with a
 * reason rather than interpolating a plausible-looking factor. A missing dimension the
 * UI admits to is recoverable; a fabricated one that reaches an inspector is not.
 */

import {
  armourGeometry,
  defaultDimsFor,
  selectStripThickness,
  type ArmourDims,
  type ArmourGeometry,
} from "@/lib/domain/armour";
import type { ArmourType, CoreConfig, Insulation } from "@/lib/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Standard tables
// ─────────────────────────────────────────────────────────────────────────────

/** A banded lookup: the largest `upTo` the value falls within wins. */
interface Band<T> {
  upTo: number;
  value: T;
}

function lookupBand<T>(bands: readonly Band<T>[], x: number): T {
  for (const b of bands) if (x <= b.upTo) return b.value;
  return bands[bands.length - 1].value;
}

/**
 * IS 7098 (Part 1) - 1988, Table 3 — nominal thickness of XLPE insulation (mm),
 * for single core UNARMOURED and all MULTICORE cables (col 3). Single-core armoured
 * runs thicker (col 2) and is carried separately below.
 */
const XLPE_INSULATION_MULTICORE_MM: Record<number, number> = {
  1.5: 0.7, 2.5: 0.7, 4: 0.7, 6: 0.7, 10: 0.7, 16: 0.7,
  25: 0.9, 35: 0.9, 50: 1.0, 70: 1.1, 95: 1.1, 120: 1.2,
  150: 1.4, 185: 1.6, 240: 1.7, 300: 1.8, 400: 2.0, 500: 2.2,
  630: 2.4, 800: 2.6, 1000: 2.8,
};

/** IS 7098 (Part 1) Table 3, col 2 — single core ARMOURED cables. */
const XLPE_INSULATION_SINGLE_ARMOURED_MM: Record<number, number> = {
  1.5: 1.0, 2.5: 1.0, 4: 1.0, 6: 1.0, 10: 1.0, 16: 1.0,
  25: 1.2, 35: 1.2, 50: 1.3, 70: 1.4, 95: 1.4, 120: 1.5,
  150: 1.7, 185: 1.9, 240: 2.0, 300: 2.1, 400: 2.4, 500: 2.6,
  630: 2.8, 800: 3.1, 1000: 3.3,
};

/**
 * IS 7098 (Part 1) - 1988, Table 5 — minimum thickness of inner sheath (mm),
 * entered with the calculated diameter over the laid-up cores.
 */
const INNER_SHEATH_MM: readonly Band<number>[] = [
  { upTo: 25, value: 0.3 },
  { upTo: 35, value: 0.4 },
  { upTo: 45, value: 0.5 },
  { upTo: 55, value: 0.6 },
  { upTo: Infinity, value: 0.7 },
];

/**
 * IS 7098 (Part 1) - 1988, Table 8 — thickness of outer sheath (mm), entered with the
 * calculated diameter under the outer sheath. Armoured cables take the col 5 minimum;
 * unarmoured take the col 3 nominal.
 */
const OUTER_SHEATH_UNARMOURED_NOMINAL_MM: readonly Band<number>[] = [
  { upTo: 15, value: 1.8 },
  { upTo: 25, value: 2.0 },
  { upTo: 35, value: 2.2 },
  { upTo: 40, value: 2.4 },
  { upTo: 45, value: 2.6 },
  { upTo: 50, value: 2.8 },
  { upTo: 55, value: 3.0 },
  { upTo: 60, value: 3.2 },
  { upTo: 65, value: 3.4 },
  { upTo: 70, value: 3.6 },
  { upTo: 75, value: 3.8 },
  { upTo: Infinity, value: 4.0 },
];

const OUTER_SHEATH_ARMOURED_MIN_MM: readonly Band<number>[] = [
  { upTo: 15, value: 1.24 },
  { upTo: 25, value: 1.4 },
  { upTo: 35, value: 1.56 },
  { upTo: 40, value: 1.72 },
  { upTo: 45, value: 1.88 },
  { upTo: 50, value: 2.04 },
  { upTo: 55, value: 2.2 },
  { upTo: 60, value: 2.36 },
  { upTo: 65, value: 2.52 },
  { upTo: 70, value: 2.68 },
  { upTo: 75, value: 2.84 },
  { upTo: Infinity, value: 3.0 },
];

/**
 * IS 7098 (Part 1) - 1988, Table 2 — cross-sectional area of reduced neutral
 * conductors. The old UI defaulted the neutral to half the phase size, which the
 * standard contradicts at several sizes (150 takes 70, not 75; 35 takes 16, not 17.5).
 */
export const REDUCED_NEUTRAL_SQMM: Record<number, number> = {
  25: 16, 35: 16, 50: 25, 70: 35, 95: 50, 120: 70, 150: 70,
  185: 95, 240: 120, 300: 150, 400: 185, 500: 240, 630: 300,
};

/** The standard's reduced-neutral size for a phase size, or null if untabulated. */
export function reducedNeutralFor(conductorSizeSqMm: number): number | null {
  return REDUCED_NEUTRAL_SQMM[conductorSizeSqMm] ?? null;
}

/**
 * Assembly (lay-up) coefficients per IS 10462 (Part 1) — the multiplier from one core's
 * diameter to the diameter of the circle circumscribing the laid-up bundle.
 *
 * Only the long-settled values are carried. 3.5 core takes the 4-core factor: the
 * fictitious method lays a reduced-neutral cable up as a four-core, and using the
 * larger phase core for all four is the conservative reading.
 */
const LAY_UP_FACTOR: Partial<Record<CoreConfig, number>> = {
  "1C": 1.0,
  "2C": 2.0,
  "3C": 2.16,
  "3.5C": 2.42,
  "4C": 2.42,
  "5C": 2.7,
  "7C": 3.0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Build-up
// ─────────────────────────────────────────────────────────────────────────────

export interface DimensionLayer {
  label: string;
  /** Thickness applied per side, mm. */
  thicknessMm: number;
  /** Diameter after this layer, mm. */
  diaOverMm: number;
  /** Where the thickness came from. */
  source: string;
}

export interface CableDimensions {
  /** Calculated conductor diameter, mm — IS 10462 fictitious method. */
  conductorDiaMm: number;
  insulationThicknessMm: number;
  diaOverInsulationMm: number;
  /** Diameter over the laid-up cores, mm. */
  laidUpDiaMm: number;
  innerSheathThicknessMm: number;
  /** The figure the armour tables are entered with. */
  diaUnderArmourMm: number;
  armour: ArmourGeometry | null;
  armourDims: ArmourDims | null;
  diaUnderOuterSheathMm: number;
  outerSheathThicknessMm: number;
  /** Calculated overall diameter, mm. */
  overallDiaMm: number;
  layers: DimensionLayer[];
}

export interface DimensionInput {
  cores: CoreConfig;
  conductorSizeSqMm: number;
  insulation: Insulation;
  armour: ArmourType;
  /** Overrides the armour size the standard would select. */
  armourDimsOverride?: ArmourDims | null;
}

export interface DimensionResult {
  dimensions: CableDimensions | null;
  /** Why dimensions could not be built, when they could not. */
  unavailableReason?: string;
}

/** Conductor diameter under the IS 10462 fictitious method: a solid circle of nominal area. */
export function fictitiousConductorDiaMm(areaSqMm: number): number {
  return Math.sqrt((4 * areaSqMm) / Math.PI);
}

/**
 * Insulation thickness for a size, from the governing standard's table.
 *
 * XLPE is the family we hold the table for (IS 7098 Part 1 Table 3). PVC-insulated
 * cables are governed by IS 1554 (Part 1) Table 2, which has not been transcribed, so
 * this returns null for PVC rather than reusing the XLPE figures — the two tables are
 * genuinely different and swapping them would be a silent lie.
 */
export function insulationThicknessMm(
  insulation: Insulation,
  conductorSizeSqMm: number,
  singleCoreArmoured: boolean,
): number | null {
  if (insulation !== "XLPE") return null;
  const table = singleCoreArmoured
    ? XLPE_INSULATION_SINGLE_ARMOURED_MM
    : XLPE_INSULATION_MULTICORE_MM;
  return table[conductorSizeSqMm] ?? null;
}

/**
 * Build the cable up layer by layer.
 *
 * Returns `{ dimensions: null, unavailableReason }` rather than guessing whenever a
 * governing figure is missing — an unmodelled PVC insulation table, or a core count
 * whose assembly coefficient we do not hold.
 */
export function buildUpDimensions(input: DimensionInput): DimensionResult {
  const { cores, conductorSizeSqMm, insulation, armour } = input;

  const layFactor = LAY_UP_FACTOR[cores];
  if (layFactor === undefined) {
    return {
      dimensions: null,
      unavailableReason:
        `No assembly coefficient held for ${cores}. IS 10462 (Part 1) — the fictitious ` +
        "calculation method that the insulation, sheath and armour tables are all read " +
        "with — is not in our document set beyond the settled 1–7 core values, so the " +
        "lay-up diameter for this core count cannot be calculated without inventing it.",
    };
  }

  const isSingleCore = cores === "1C";
  const ti = insulationThicknessMm(insulation, conductorSizeSqMm, isSingleCore && armour !== "Unarmoured");
  if (ti === null) {
    return {
      dimensions: null,
      unavailableReason:
        insulation === "XLPE"
          ? `IS 7098 (Part 1) Table 3 does not tabulate ${conductorSizeSqMm} sq mm.`
          : `Insulation thickness for ${insulation} comes from IS 1554 (Part 1) Table 2, ` +
            "which has not been transcribed yet. Only XLPE (IS 7098 Part 1 Table 3) is modelled.",
    };
  }

  const layers: DimensionLayer[] = [];

  // ── Conductor ──
  const conductorDiaMm = fictitiousConductorDiaMm(conductorSizeSqMm);
  layers.push({
    label: "Conductor",
    thicknessMm: 0,
    diaOverMm: conductorDiaMm,
    source: "IS 10462 (Part 1) fictitious method — √(4A/π)",
  });

  // ── Insulation ──
  const diaOverInsulationMm = conductorDiaMm + 2 * ti;
  layers.push({
    label: "Insulation",
    thicknessMm: ti,
    diaOverMm: diaOverInsulationMm,
    source: "IS 7098 (Part 1) Table 3",
  });

  // ── Lay-up ──
  const laidUpDiaMm = diaOverInsulationMm * layFactor;
  layers.push({
    label: "Laid-up cores",
    thicknessMm: 0,
    diaOverMm: laidUpDiaMm,
    source: `IS 10462 (Part 1) assembly coefficient ${layFactor} for ${cores}`,
  });

  // ── Inner sheath (single core cables have none — cl. 12.3) ──
  const innerSheathThicknessMm = isSingleCore ? 0 : lookupBand(INNER_SHEATH_MM, laidUpDiaMm);
  const diaUnderArmourMm = laidUpDiaMm + 2 * innerSheathThicknessMm;
  if (!isSingleCore) {
    layers.push({
      label: "Inner sheath",
      thicknessMm: innerSheathThicknessMm,
      diaOverMm: diaUnderArmourMm,
      source: "IS 7098 (Part 1) Table 5",
    });
  }

  // ── Armour ──
  const armourDims =
    input.armourDimsOverride !== undefined
      ? input.armourDimsOverride
      : defaultDimsFor(armour, diaUnderArmourMm);
  const armourGeom = armourGeometry(armourDims, diaUnderArmourMm);
  const diaUnderOuterSheathMm = armourGeom ? armourGeom.diaOverArmourMm : diaUnderArmourMm;
  if (armourGeom && armourDims) {
    layers.push({
      label:
        armourDims.kind === "strip"
          ? `Armour — ${armourGeom.count} × GI strip ${armourDims.widthMm} × ${armourDims.thicknessMm} mm`
          : `Armour — ${armourGeom.count} × GI round wire Ø ${armourDims.diameterMm} mm`,
      thicknessMm: armourGeom.diameterIncreaseMm / 2,
      diaOverMm: diaUnderOuterSheathMm,
      source: "IS 7098 (Part 1) Table 6",
    });
  }

  // ── Outer sheath ──
  const isArmoured = armour !== "Unarmoured";
  const outerSheathThicknessMm = lookupBand(
    isArmoured ? OUTER_SHEATH_ARMOURED_MIN_MM : OUTER_SHEATH_UNARMOURED_NOMINAL_MM,
    diaUnderOuterSheathMm,
  );
  const overallDiaMm = diaUnderOuterSheathMm + 2 * outerSheathThicknessMm;
  layers.push({
    label: "Outer sheath",
    thicknessMm: outerSheathThicknessMm,
    diaOverMm: overallDiaMm,
    source: `IS 7098 (Part 1) Table 8 (${isArmoured ? "armoured, min" : "unarmoured, nominal"})`,
  });

  return {
    dimensions: {
      conductorDiaMm,
      insulationThicknessMm: ti,
      diaOverInsulationMm,
      laidUpDiaMm,
      innerSheathThicknessMm,
      diaUnderArmourMm,
      armour: armourGeom,
      armourDims,
      diaUnderOuterSheathMm,
      outerSheathThicknessMm,
      overallDiaMm,
      layers,
    },
  };
}

/** The strip thickness the standard selects at this diameter. Re-exported for the UI. */
export { selectStripThickness };
