/**
 * IS 7098 (Part 1) : 2025 — Crosslinked polyethylene (XLPE) insulated thermoplastic sheathed
 * cables, working voltages up to and including 1 100 V. Second Revision.
 *
 * This is the LT power cable standard: the 3.5C x 300 A2XFY sort of cable.
 *
 * Only what is UNIQUE to this standard lives here. The inner sheath, armour and outer sheath
 * tables are shared byte-for-byte with IS 1554 (Part 1) and live in protective-coverings.ts —
 * see the note there for why that is one module rather than two.
 *
 * Encoding status: DRAFT pending human row-by-row verification per the encoding SOP.
 */
import { permittedAluminiumGrades } from "./is8130-2013";
import type { ConductorMaterialCode } from "./is8130-2013";
import type { StandardsDataset } from "./types";
import { StandardsLookupError } from "./types";

export const IS7098_1_2025: StandardsDataset = {
  standardId: "IS7098-1",
  edition: "2025",
  body: "BIS",
  title:
    "Crosslinked polyethylene insulated thermoplastic sheathed cables — Specification, Part 1: For working voltages up to and including 1 100 volts (Second Revision)",
  status: "draft",
  supersedes: "IS 7098 (Part 1) : 1988",
  sourceFile: "7098_1_2025_XLPE.pdf",
  coverageNote:
    "Table 3 (insulation), Table 2 (reduced neutral) and Table 4 (lay-up) encoded here; " +
    "Tables 5/6/7 (inner sheath, armour, outer sheath) are in protective-coverings.ts, shared " +
    "with IS 1554-1. Test schedules and material property tables (Tables 1/1A/1B) are not " +
    "encoded — they are conformance criteria, not derivation inputs.",
};

/** §1.4 — thermal ratings. XLPE runs hotter than PVC, which is the reason to choose it. */
export const IS7098_1_THERMAL = {
  maxContinuousConductorTempC: 90,
  maxShortCircuitConductorTempC: 250,
  ref: "IS 7098 (Part 1) : 2025, §1.4",
} as const;

/** §1.2 — rated voltage. */
export const IS7098_1_RATED_VOLTAGE = {
  acMaxV: 1100,
  dcMaxV: 1500,
  continuousOverloadPercent: 10,
  ref: "IS 7098 (Part 1) : 2025, §1.2",
} as const;

/**
 * TABLE 3 — Nominal thickness of insulation (Clauses 10.2, 10.3).
 *
 * Two columns, and the distinction is easy to get backwards: single-core ARMOURED cables get
 * THICKER insulation than single-core unarmoured and multi-core cables of the same size.
 */
export interface XlpeInsulationRow {
  csaSqMm: number;
  /** Single-core armoured cables. */
  singleCoreArmouredMm: number;
  /** Single-core unarmoured AND all multi-core cables. */
  unarmouredOrMulticoreMm: number;
}

export const IS7098_1_TABLE3_INSULATION: ReadonlyArray<XlpeInsulationRow> = [
  { csaSqMm: 1.5, singleCoreArmouredMm: 1.0, unarmouredOrMulticoreMm: 0.7 },
  { csaSqMm: 2.5, singleCoreArmouredMm: 1.0, unarmouredOrMulticoreMm: 0.7 },
  { csaSqMm: 4, singleCoreArmouredMm: 1.0, unarmouredOrMulticoreMm: 0.7 },
  { csaSqMm: 6, singleCoreArmouredMm: 1.0, unarmouredOrMulticoreMm: 0.7 },
  { csaSqMm: 10, singleCoreArmouredMm: 1.0, unarmouredOrMulticoreMm: 0.7 },
  { csaSqMm: 16, singleCoreArmouredMm: 1.0, unarmouredOrMulticoreMm: 0.7 },
  { csaSqMm: 25, singleCoreArmouredMm: 1.2, unarmouredOrMulticoreMm: 0.9 },
  { csaSqMm: 35, singleCoreArmouredMm: 1.2, unarmouredOrMulticoreMm: 0.9 },
  { csaSqMm: 50, singleCoreArmouredMm: 1.3, unarmouredOrMulticoreMm: 1.0 },
  { csaSqMm: 70, singleCoreArmouredMm: 1.4, unarmouredOrMulticoreMm: 1.1 },
  { csaSqMm: 95, singleCoreArmouredMm: 1.4, unarmouredOrMulticoreMm: 1.1 },
  { csaSqMm: 120, singleCoreArmouredMm: 1.5, unarmouredOrMulticoreMm: 1.2 },
  { csaSqMm: 150, singleCoreArmouredMm: 1.7, unarmouredOrMulticoreMm: 1.4 },
  { csaSqMm: 185, singleCoreArmouredMm: 1.9, unarmouredOrMulticoreMm: 1.6 },
  { csaSqMm: 240, singleCoreArmouredMm: 2.0, unarmouredOrMulticoreMm: 1.7 },
  { csaSqMm: 300, singleCoreArmouredMm: 2.1, unarmouredOrMulticoreMm: 1.8 },
  { csaSqMm: 400, singleCoreArmouredMm: 2.4, unarmouredOrMulticoreMm: 2.0 },
  { csaSqMm: 500, singleCoreArmouredMm: 2.6, unarmouredOrMulticoreMm: 2.2 },
  { csaSqMm: 630, singleCoreArmouredMm: 2.8, unarmouredOrMulticoreMm: 2.4 },
  { csaSqMm: 800, singleCoreArmouredMm: 3.1, unarmouredOrMulticoreMm: 2.6 },
  { csaSqMm: 1000, singleCoreArmouredMm: 3.3, unarmouredOrMulticoreMm: 2.8 },
];

/**
 * TABLE 2 — Cross-sectional area of reduced neutral conductors (Clause 9.3).
 *
 * The neutral of a 3½-core cable. Note 150 and 120 both take a 70 sq mm neutral, so this is
 * NOT a fixed ratio and must not be computed — it is a lookup.
 */
export const IS7098_1_TABLE2_REDUCED_NEUTRAL: ReadonlyArray<{ phaseSqMm: number; neutralSqMm: number }> = [
  { phaseSqMm: 25, neutralSqMm: 16 },
  { phaseSqMm: 35, neutralSqMm: 16 },
  { phaseSqMm: 50, neutralSqMm: 25 },
  { phaseSqMm: 70, neutralSqMm: 35 },
  { phaseSqMm: 95, neutralSqMm: 50 },
  { phaseSqMm: 120, neutralSqMm: 70 },
  { phaseSqMm: 150, neutralSqMm: 70 },
  { phaseSqMm: 185, neutralSqMm: 95 },
  { phaseSqMm: 240, neutralSqMm: 120 },
  { phaseSqMm: 300, neutralSqMm: 150 },
  { phaseSqMm: 400, neutralSqMm: 185 },
  { phaseSqMm: 500, neutralSqMm: 240 },
  { phaseSqMm: 630, neutralSqMm: 300 },
];

/** Whether a cable takes the single-core-armoured insulation column or the other one. */
export interface InsulationLookup {
  csaSqMm: number;
  coreCount: number;
  armoured: boolean;
}

/**
 * §10.2 / Table 3 — nominal insulation thickness.
 *
 * The thicker column applies ONLY to single-core armoured cables. A 3-core armoured cable takes
 * the multi-core column, which is the case most likely to be got wrong by eye.
 */
export function xlpeInsulationThickness(lookup: InsulationLookup): { nominalMm: number; ref: string; column: string } {
  const row = IS7098_1_TABLE3_INSULATION.find((r) => r.csaSqMm === lookup.csaSqMm);
  if (!row) throw new StandardsLookupError("IS7098-1", "Table 3", "csaSqMm", lookup.csaSqMm);

  const singleCoreArmoured = lookup.coreCount === 1 && lookup.armoured;
  return {
    nominalMm: singleCoreArmoured ? row.singleCoreArmouredMm : row.unarmouredOrMulticoreMm,
    column: singleCoreArmoured ? "single-core armoured" : "single-core unarmoured / multi-core",
    ref: `IS 7098 (Part 1) : 2025, Table 3 (${lookup.csaSqMm} sq mm)`,
  };
}

/** §9.3 / Table 2 — reduced-neutral size for a 3½-core cable. */
export function reducedNeutralSize(phaseSqMm: number): { neutralSqMm: number; ref: string } {
  const row = IS7098_1_TABLE2_REDUCED_NEUTRAL.find((r) => r.phaseSqMm === phaseSqMm);
  if (!row) throw new StandardsLookupError("IS7098-1", "Table 2", "phaseSqMm", phaseSqMm);
  return { neutralSqMm: row.neutralSqMm, ref: `IS 7098 (Part 1) : 2025, Table 2 (${phaseSqMm} sq mm)` };
}

/**
 * §9.1 — conductor construction: solid or stranded, and which IS 8130 flexibility class.
 *
 * The thresholds differ by material — aluminium is stranded from 16 sq mm, copper from 10.
 */
export function conductorConstruction(csaSqMm: number, material: ConductorMaterialCode): {
  form: "solid" | "solid-or-stranded" | "stranded";
  klass: "Class 1" | "Class 2";
  ref: string;
} {
  const ref = "IS 7098 (Part 1) : 2025, §9.1";
  if (material === "AL") {
    if (csaSqMm < 1.5) throw new StandardsLookupError("IS7098-1", "§9.1", "csaSqMm (Al)", csaSqMm);
    if (csaSqMm === 1.5) return { form: "solid", klass: "Class 1", ref };
    if (csaSqMm <= 10) return { form: "solid-or-stranded", klass: "Class 2", ref };
    return { form: "stranded", klass: "Class 2", ref };
  }
  // Copper: the table has no row below 1.5 sq mm.
  if (csaSqMm < 1.5) throw new StandardsLookupError("IS7098-1", "§9.1", "csaSqMm (Cu)", csaSqMm);
  if (csaSqMm <= 6) return { form: "solid-or-stranded", klass: "Class 2", ref };
  return { form: "stranded", klass: "Class 2", ref };
}

/** §7.1 — permitted armour materials. */
export const IS7098_1_ARMOUR_MATERIALS = [
  "Galvanized round steel wire",
  "Galvanized formed steel wire (strip)",
  "Any metallic non-magnetic wire/strip",
] as const;

/** §14.6 — mechanical requirements on armour wire taken from the finished cable. */
export const IS7098_1_ARMOUR_WIRE_REQUIREMENTS = {
  tensileStrengthMinNPerMm2: 250,
  tensileStrengthMaxNPerMm2: 580,
  elongationAtBreakMinPercent: 6,
  ref: "IS 7098 (Part 1) : 2025, §14.6",
} as const;

/** §14.1.2 — armour coverage floor, and the Annex C formula that measures it. */
export const IS7098_1_ARMOUR_COVERAGE_MIN_PERCENT = 90;

/**
 * Annex C — armour coverage percentage.
 *
 *   coverage = (N × d) / (π × D × cos a) × 100,   where tan a = π × D / C
 *
 * N wires of width d, over a diameter-under-armour D, at lay length C.
 */
export function armourCoveragePercent(args: {
  wireCount: number;
  wireDiaOrWidthMm: number;
  diaUnderArmourMm: number;
  layLengthMm: number;
}): number {
  const a = Math.atan((Math.PI * args.diaUnderArmourMm) / args.layLengthMm);
  const w = Math.PI * args.diaUnderArmourMm * Math.cos(a);
  return ((args.wireCount * args.wireDiaOrWidthMm) / w) * 100;
}

/** §8 — outer sheath compounds this edition permits. */
export const IS7098_1_SHEATH_COMPOUNDS = ["PVC ST-2", "PE", "LSHF ST8", "LSHF ST12"] as const;
export type Is7098SheathCompound = (typeof IS7098_1_SHEATH_COMPOUNDS)[number];

/** §18.3 — cable designation code letters. Copper takes NO letter, which is why A2XFY has no C. */
export const IS7098_1_CODE_LETTERS: Readonly<Record<string, string>> = {
  "Aluminium conductor": "A",
  "XLPE insulation": "2X",
  "Steel round wire armour": "W",
  "Non-magnetic round wire armour": "Wa",
  "Steel strip armour": "F",
  "Non-magnetic strip armour": "Fa",
  "Double steel strip armour": "FF",
  "Double steel round wire armour": "WW",
  "PVC outer sheath": "Y",
  "PE outer sheath": "2Y",
  "LSHF outer sheath": "Z",
};

/** Sizes with an encoded Table 3 row — the offerable set for LT XLPE power cable. */
export const IS7098_1_SIZES: number[] = IS7098_1_TABLE3_INSULATION.map((r) => r.csaSqMm);
