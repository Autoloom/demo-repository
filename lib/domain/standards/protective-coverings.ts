/**
 * Protective-covering tables shared by IS 7098 (Part 1) and IS 1554 (Part 1).
 *
 * ─── Why one module and not two ───────────────────────────────────────────────────────────────
 *
 * The build plan predicted (§0.3) that IS 1554-1 and IS 7098-1 are structurally identical. Having
 * both PDFs in hand, they are more than structurally identical for these three tables — they are
 * VALUE-FOR-VALUE THE SAME:
 *
 *   • Inner sheath      IS 7098-1 Table 5  ==  IS 1554-1 Table 4   (5 bands, 0.3-0.7 mm)
 *   • Armour dimensions IS 7098-1 Table 6  ==  IS 1554-1 Table 5   (6 bands, 1.4-4.0 mm wire)
 *   • Outer sheath      IS 7098-1 Table 7  ==  IS 1554-1 Table 7   (12 bands, 1.8-4.0 mm)
 *
 * This is not a coincidence: both derive from IEC 60502 and both key off the same IS 10462
 * fictitious diameters. Encoding them twice would create two sources of truth that could drift
 * apart on a later edition, so they live here once and each cable standard cites its own table
 * number through `tableRefs`.
 *
 * The two standards DO differ on insulation thickness (XLPE runs thinner than PVC at the same
 * size) and on sheath compound, so those stay in their own per-standard modules.
 *
 * ─── One genuine difference, encoded ──────────────────────────────────────────────────────────
 *
 * IS 7098-1:2025 Table 7 closes its last band at 85 mm ("75 to 85"), where IS 1554-1:1988
 * Table 7 leaves it open ("75 —"). Modelled per-standard rather than papered over: a 90 mm
 * XLPE cable is outside the 2025 table and must raise a lookup error rather than silently
 * taking the 4.0 mm row.
 *
 * Every band is keyed by a CALCULATED (fictitious) diameter from IS 10462 (Part 1), never by
 * conductor size — see is10462-1-1983.ts.
 *
 * Encoding status: DRAFT pending human row-by-row verification per the encoding SOP.
 */
import { lookupBand } from "./types";
import type { BandedTable } from "./types";

/** Which cable standard is being applied — selects the right refs and the outer-sheath cap. */
export type CoveringStandard = "IS7098-1" | "IS1554-1";

const TABLE_REFS: Record<CoveringStandard, { innerSheath: string; armour: string; outerSheath: string; edition: string }> = {
  "IS7098-1": { innerSheath: "Table 5", armour: "Table 6", outerSheath: "Table 7", edition: "2025" },
  "IS1554-1": { innerSheath: "Table 4", armour: "Table 5", outerSheath: "Table 7", edition: "1988" },
};

function ref(standard: CoveringStandard, table: keyof (typeof TABLE_REFS)["IS7098-1"]): string {
  const r = TABLE_REFS[standard];
  const name = standard === "IS7098-1" ? "IS 7098 (Part 1)" : "IS 1554 (Part 1)";
  return `${name} : ${r.edition}, ${r[table]}`;
}

/**
 * INNER SHEATH — minimum thickness, keyed by calculated diameter over laid-up cores.
 * IS 7098-1:2025 Table 5 / IS 1554-1:1988 Table 4. Single-core cables have no inner sheath.
 */
export const INNER_SHEATH_TABLE: BandedTable<{ minThicknessMm: number }> = {
  kind: "banded",
  keyField: "calculatedDiaOverLaidUpCoresMm",
  bands: [
    { over: null, upTo: 25, values: { minThicknessMm: 0.3 }, ref: "inner sheath, ≤ 25" },
    { over: 25, upTo: 35, values: { minThicknessMm: 0.4 }, ref: "inner sheath, 25-35" },
    { over: 35, upTo: 45, values: { minThicknessMm: 0.5 }, ref: "inner sheath, 35-45" },
    { over: 45, upTo: 55, values: { minThicknessMm: 0.6 }, ref: "inner sheath, 45-55" },
    { over: 55, upTo: null, values: { minThicknessMm: 0.7 }, ref: "inner sheath, > 55" },
  ],
};

/**
 * ARMOUR — dimensions, keyed by calculated diameter UNDER the armour.
 *
 * Both standards print two alternative practices:
 *   Method A — formed wire (strip) 0.8 mm, for all diameters in excess of 13 mm
 *   Method B — the banded round-wire / formed-wire table below
 *
 * `roundWireDiaMm` is null in the first band only: at 13 mm and below the standards specify
 * round wire alone (§14.2 / §13.2 — "where the calculated diameter below armouring does not
 * exceed 13 mm, the armour shall consist of round wires").
 */
export const ARMOUR_TABLE: BandedTable<{ formedWireThicknessMm: number | null; roundWireDiaMm: number }> = {
  kind: "banded",
  keyField: "calculatedDiaUnderArmourMm",
  bands: [
    { over: null, upTo: 13, values: { formedWireThicknessMm: null, roundWireDiaMm: 1.4 }, ref: "armour, ≤ 13" },
    { over: 13, upTo: 25, values: { formedWireThicknessMm: 0.8, roundWireDiaMm: 1.6 }, ref: "armour, 13-25" },
    { over: 25, upTo: 40, values: { formedWireThicknessMm: 0.8, roundWireDiaMm: 2.0 }, ref: "armour, 25-40" },
    { over: 40, upTo: 55, values: { formedWireThicknessMm: 1.4, roundWireDiaMm: 2.5 }, ref: "armour, 40-55" },
    { over: 55, upTo: 70, values: { formedWireThicknessMm: 1.4, roundWireDiaMm: 3.15 }, ref: "armour, 55-70" },
    { over: 70, upTo: null, values: { formedWireThicknessMm: 1.4, roundWireDiaMm: 4.0 }, ref: "armour, > 70" },
  ],
};

/** §14.2 / §13.2 — below this calculated diameter, armour must be round wire. */
export const ROUND_WIRE_ONLY_MAX_DIA_MM = 13;

/** Method A: a single formed-wire thickness usable for any diameter above 13 mm. */
export const ARMOUR_METHOD_A = { formedWireThicknessMm: 0.8, appliesOverDiaMm: 13 } as const;

/**
 * OUTER SHEATH — keyed by calculated diameter under the outer sheath.
 *
 * Three columns: nominal and minimum for UNARMOURED cables, and a single minimum for ARMOURED
 * cables. The armoured minimum equals the unarmoured minimum at every band in both standards.
 */
export const OUTER_SHEATH_TABLE: BandedTable<{
  unarmouredNominalMm: number;
  unarmouredMinMm: number;
  armouredMinMm: number;
}> = {
  kind: "banded",
  keyField: "calculatedDiaUnderOuterSheathMm",
  bands: [
    { over: null, upTo: 15, values: { unarmouredNominalMm: 1.8, unarmouredMinMm: 1.24, armouredMinMm: 1.24 }, ref: "outer sheath, ≤ 15" },
    { over: 15, upTo: 25, values: { unarmouredNominalMm: 2.0, unarmouredMinMm: 1.4, armouredMinMm: 1.4 }, ref: "outer sheath, 15-25" },
    { over: 25, upTo: 35, values: { unarmouredNominalMm: 2.2, unarmouredMinMm: 1.56, armouredMinMm: 1.56 }, ref: "outer sheath, 25-35" },
    { over: 35, upTo: 40, values: { unarmouredNominalMm: 2.4, unarmouredMinMm: 1.72, armouredMinMm: 1.72 }, ref: "outer sheath, 35-40" },
    { over: 40, upTo: 45, values: { unarmouredNominalMm: 2.6, unarmouredMinMm: 1.88, armouredMinMm: 1.88 }, ref: "outer sheath, 40-45" },
    { over: 45, upTo: 50, values: { unarmouredNominalMm: 2.8, unarmouredMinMm: 2.04, armouredMinMm: 2.04 }, ref: "outer sheath, 45-50" },
    { over: 50, upTo: 55, values: { unarmouredNominalMm: 3.0, unarmouredMinMm: 2.2, armouredMinMm: 2.2 }, ref: "outer sheath, 50-55" },
    { over: 55, upTo: 60, values: { unarmouredNominalMm: 3.2, unarmouredMinMm: 2.36, armouredMinMm: 2.36 }, ref: "outer sheath, 55-60" },
    { over: 60, upTo: 65, values: { unarmouredNominalMm: 3.4, unarmouredMinMm: 2.52, armouredMinMm: 2.52 }, ref: "outer sheath, 60-65" },
    { over: 65, upTo: 70, values: { unarmouredNominalMm: 3.6, unarmouredMinMm: 2.68, armouredMinMm: 2.68 }, ref: "outer sheath, 65-70" },
    { over: 70, upTo: 75, values: { unarmouredNominalMm: 3.8, unarmouredMinMm: 2.84, armouredMinMm: 2.84 }, ref: "outer sheath, 70-75" },
    // Last band: 7098-1:2025 closes at 85; 1554-1:1988 is open-ended. See outerSheathThickness().
    { over: 75, upTo: null, values: { unarmouredNominalMm: 4.0, unarmouredMinMm: 3.0, armouredMinMm: 3.0 }, ref: "outer sheath, > 75" },
  ],
};

/** IS 7098-1:2025 Table 7 stops at 85 mm; IS 1554-1:1988 Table 7 does not. */
export const OUTER_SHEATH_MAX_DIA_MM: Record<CoveringStandard, number | null> = {
  "IS7098-1": 85,
  "IS1554-1": null,
};

export interface CoveringValue<T> {
  values: T;
  ref: string;
}

/** Inner-sheath minimum thickness for a calculated diameter over laid-up cores. */
export function innerSheathThickness(
  standard: CoveringStandard,
  calculatedDiaOverLaidUpCoresMm: number,
): CoveringValue<{ minThicknessMm: number }> {
  const hit = lookupBand(standard, ref(standard, "innerSheath"), INNER_SHEATH_TABLE, calculatedDiaOverLaidUpCoresMm);
  return { values: hit.values, ref: `${ref(standard, "innerSheath")} (${hit.ref})` };
}

/** Armour dimensions for a calculated diameter under the armour (Method B). */
export function armourDimensions(
  standard: CoveringStandard,
  calculatedDiaUnderArmourMm: number,
): CoveringValue<{
  formedWireThicknessMm: number | null;
  roundWireDiaMm: number;
  roundWireOnly: boolean;
}> {
  const hit = lookupBand(standard, ref(standard, "armour"), ARMOUR_TABLE, calculatedDiaUnderArmourMm);
  return {
    values: {
      ...hit.values,
      roundWireOnly: calculatedDiaUnderArmourMm <= ROUND_WIRE_ONLY_MAX_DIA_MM,
    },
    ref: `${ref(standard, "armour")} (${hit.ref})`,
  };
}

/**
 * Outer-sheath thickness for a calculated diameter under the outer sheath.
 *
 * Throws above the standard's own upper bound rather than extrapolating the last band — the
 * 2025 XLPE table genuinely ends at 85 mm.
 */
export function outerSheathThickness(
  standard: CoveringStandard,
  calculatedDiaUnderOuterSheathMm: number,
): CoveringValue<{ unarmouredNominalMm: number; unarmouredMinMm: number; armouredMinMm: number }> {
  const cap = OUTER_SHEATH_MAX_DIA_MM[standard];
  if (cap !== null && calculatedDiaUnderOuterSheathMm > cap) {
    throw new Error(
      `No row in ${ref(standard, "outerSheath")} for calculated diameter ${calculatedDiaUnderOuterSheathMm} mm — ` +
        `the table ends at ${cap} mm. The standard does not cover this cable; do not extrapolate.`,
    );
  }
  const hit = lookupBand(standard, ref(standard, "outerSheath"), OUTER_SHEATH_TABLE, calculatedDiaUnderOuterSheathMm);
  return { values: hit.values, ref: `${ref(standard, "outerSheath")} (${hit.ref})` };
}

/**
 * §10.3 / §9.3 — tolerance on insulation thickness. Identical wording in both standards:
 * the smallest measured value shall not fall below nominal by more than 0.1 mm + 0.1·t_i.
 */
export function insulationToleranceFloorMm(nominalTiMm: number): number {
  return nominalTiMm - (0.1 + 0.1 * nominalTiMm);
}

/**
 * §15.3.1 note / §14.4.1 note — a multi-core UNARMOURED cable may extrude inner and outer
 * sheath as one layer, in which case the combined thickness must be at least the sum.
 */
export function combinedSheathMinimumMm(innerMinMm: number, outerNominalOrMinMm: number): number {
  return innerMinMm + outerNominalOrMinMm;
}
