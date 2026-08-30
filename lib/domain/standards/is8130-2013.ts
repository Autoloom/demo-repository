/**
 * IS 8130 : 2013 — Conductors for insulated electric cables and flexible cords (Second Revision).
 * Reaffirmed 2018. Derived from IEC 60228 (2004).
 *
 * VERSIONED, IMMUTABLE dataset. IS 8130:1984 is a SEPARATE module — never mutate this one to
 * "update" the standard. Both editions are live (Haryana pins 1984, WBSEDCL pins 2013).
 *
 * ─── ⚠️ WHAT THIS STANDARD DOES NOT CONTAIN ───────────────────────────────────────────────────
 *
 * IS 8130 specifies NO CONDUCTOR DIAMETERS and NO STRAND DIAMETERS for Class 1 and Class 2
 * conductors. Table 2 has four data columns only: nominal area, minimum number of wires,
 * and maximum resistance (Cu plain / Cu tinned / Al). That is the whole specification.
 *
 * This is deliberate, and §3.2 says why: nominal cross-sectional area is a "value that identifies
 * a particular size of conductor but is not subject to direct measurement". The NOTE to §3 adds:
 * "Each particular size of conductor in this standard is required to meet a maximum resistance
 * value." A conductor conforms by RESISTANCE, not by dimension — so the manufacturer is free to
 * choose the actual diameter, and this is exactly why IS 10462's fictitious method exists (see
 * is10462-1-1983.ts).
 *
 * An earlier version of this module carried `strandDiaMinMm` and `compactedDiaMm` columns with
 * fourteen values marked `// GAP: confirm from PDF`. The PDF is now in hand and those columns
 * DO NOT EXIST IN THE STANDARD — they could never have been confirmed. They are removed rather
 * than left pending. Where a real conductor diameter is genuinely needed (bundle mass, drum
 * capacity), it must come from the manufacturer's own works data or the approved GTP, tagged
 * accordingly — never presented as an IS 8130 lookup.
 *
 * Only Class 5/6 (flexible) and welding tables specify a wire diameter, and even there it is a
 * MAXIMUM permitted wire diameter, not a nominal conductor diameter.
 *
 * ─── Minimum, not nominal ─────────────────────────────────────────────────────────────────────
 *
 * Table 2 columns 3-6 are the MINIMUM number of wires (§6.2.3, §6.3.3: "shall be not less than").
 * A 7-wire count is a floor a design must meet, not a fact about a given cable. Field named
 * `minWires` so it cannot be misread as "this conductor has 7 strands".
 *
 * Encoding status: DRAFT pending human row-by-row verification per the encoding SOP.
 */
import type { StandardsDataset } from "./types";
import { StandardsLookupError } from "./types";

export const IS8130_2013: StandardsDataset = {
  standardId: "IS8130",
  edition: "2013",
  body: "BIS",
  title: "Conductors for insulated electric cables and flexible cords — Specification (Second Revision)",
  status: "draft",
  reaffirmed: "2018",
  supersedes: "IS 8130 : 1984",
  sourceFile: "8130 (1).pdf",
  coverageNote:
    "Tables 1-6 complete. NOTE: this standard specifies no conductor or strand DIAMETERS for " +
    "Class 1/2 — conformance is by maximum resistance only (§3.2). Diameters must come from " +
    "IS 10462 (fictitious, for sheath sizing) or from works data (actual).",
};

export type ConductorMaterialCode = "AL" | "CU";
/** Class 1 solid, Class 2 stranded (fixed installations); 5 and 6 flexible; welding Al unclassed. */
export type IS8130Class = "Class 1" | "Class 2" | "Class 5" | "Class 6" | "Welding Al";
/** §4.1 aluminium tensile grades. */
export type ConductorGrade = "0" | "H2" | "H4";
/** §6.3 / Table 2 column groups. */
export type ConductorForm = "circular-non-compacted" | "compacted-or-shaped";

/** §4.1 — aluminium grade by tensile strength, N/mm². */
export const IS8130_2013_AL_GRADES = [
  { grade: "0" as const, tensileMinNPerMm2: null, tensileMaxNPerMm2: 100, ref: "IS 8130 : 2013, §4.1" },
  { grade: "H2" as const, tensileMinNPerMm2: 100, tensileMaxNPerMm2: 150, ref: "IS 8130 : 2013, §4.1" },
  { grade: "H4" as const, tensileMinNPerMm2: 150, tensileMaxNPerMm2: null, ref: "IS 8130 : 2013, §4.1" },
];

/**
 * §4.1(a)-(c) — which aluminium grades are permitted for a given conductor.
 * Shaped SOLID conductors and welding cables are Grade 0 only; ≤10 sq mm must be H2 or H4.
 */
export function permittedAluminiumGrades(args: {
  csaSqMm: number;
  shapedSolid?: boolean;
  welding?: boolean;
}): { grades: ConductorGrade[]; ref: string } {
  if (args.shapedSolid || args.welding) {
    return { grades: ["0"], ref: "IS 8130 : 2013, §4.1(a)" };
  }
  if (args.csaSqMm <= 10) return { grades: ["H2", "H4"], ref: "IS 8130 : 2013, §4.1(b)" };
  return { grades: ["0", "H2", "H4"], ref: "IS 8130 : 2013, §4.1(c)" };
}

/**
 * TABLE 1 — Solid conductors, Class 1 (Clauses 6.1.1, 7.3.1).
 * `null` = the standard prints "—" for that combination, i.e. not specified. Never a zero.
 */
export interface SolidConductorRow {
  csaSqMm: number;
  /** Circular plain copper, Ω/km at 20 °C. */
  cuPlainOhmPerKm: number | null;
  /** Circular tinned copper, Ω/km at 20 °C. */
  cuTinnedOhmPerKm: number | null;
  /** Aluminium, circular OR shaped, Ω/km at 20 °C. */
  alOhmPerKm: number | null;
  /** Footnote 1: solid Cu ≥25 sq mm is for particular cable types, not general purpose. */
  cuSpecialPurpose?: boolean;
  /** Footnote 2: aluminium 10-35 sq mm is circular only (cf. §6.1.3). */
  alCircularOnly?: boolean;
  /** Footnote 3: for single-core, four sectoral shaped conductors may form one circular conductor. */
  alSectoralAssemblyAllowed?: boolean;
}

export const IS8130_2013_TABLE1_SOLID: ReadonlyArray<SolidConductorRow> = [
  { csaSqMm: 0.5, cuPlainOhmPerKm: 36.0, cuTinnedOhmPerKm: 36.7, alOhmPerKm: null },
  { csaSqMm: 0.75, cuPlainOhmPerKm: 24.5, cuTinnedOhmPerKm: 24.8, alOhmPerKm: null },
  { csaSqMm: 1, cuPlainOhmPerKm: 18.1, cuTinnedOhmPerKm: 18.2, alOhmPerKm: null },
  { csaSqMm: 1.5, cuPlainOhmPerKm: 12.1, cuTinnedOhmPerKm: 12.2, alOhmPerKm: null },
  { csaSqMm: 2.5, cuPlainOhmPerKm: 7.41, cuTinnedOhmPerKm: 7.56, alOhmPerKm: null },
  { csaSqMm: 4, cuPlainOhmPerKm: 4.61, cuTinnedOhmPerKm: 4.7, alOhmPerKm: null },
  { csaSqMm: 6, cuPlainOhmPerKm: 3.08, cuTinnedOhmPerKm: 3.11, alOhmPerKm: null },
  { csaSqMm: 10, cuPlainOhmPerKm: 1.83, cuTinnedOhmPerKm: 1.84, alOhmPerKm: 3.08, alCircularOnly: true },
  { csaSqMm: 16, cuPlainOhmPerKm: 1.15, cuTinnedOhmPerKm: 1.16, alOhmPerKm: 1.91, alCircularOnly: true },
  { csaSqMm: 25, cuPlainOhmPerKm: 0.727, cuTinnedOhmPerKm: null, alOhmPerKm: 1.2, cuSpecialPurpose: true, alCircularOnly: true },
  { csaSqMm: 35, cuPlainOhmPerKm: 0.524, cuTinnedOhmPerKm: null, alOhmPerKm: 0.868, cuSpecialPurpose: true, alCircularOnly: true },
  { csaSqMm: 50, cuPlainOhmPerKm: 0.387, cuTinnedOhmPerKm: null, alOhmPerKm: 0.641, cuSpecialPurpose: true },
  { csaSqMm: 70, cuPlainOhmPerKm: 0.268, cuTinnedOhmPerKm: null, alOhmPerKm: 0.443, cuSpecialPurpose: true },
  { csaSqMm: 95, cuPlainOhmPerKm: 0.193, cuTinnedOhmPerKm: null, alOhmPerKm: 0.32, cuSpecialPurpose: true, alSectoralAssemblyAllowed: true },
  { csaSqMm: 120, cuPlainOhmPerKm: 0.153, cuTinnedOhmPerKm: null, alOhmPerKm: 0.253, cuSpecialPurpose: true, alSectoralAssemblyAllowed: true },
  { csaSqMm: 150, cuPlainOhmPerKm: 0.124, cuTinnedOhmPerKm: null, alOhmPerKm: 0.206, cuSpecialPurpose: true, alSectoralAssemblyAllowed: true },
  { csaSqMm: 185, cuPlainOhmPerKm: null, cuTinnedOhmPerKm: null, alOhmPerKm: 0.164, alSectoralAssemblyAllowed: true },
  { csaSqMm: 240, cuPlainOhmPerKm: null, cuTinnedOhmPerKm: null, alOhmPerKm: 0.125, alSectoralAssemblyAllowed: true },
  { csaSqMm: 300, cuPlainOhmPerKm: null, cuTinnedOhmPerKm: null, alOhmPerKm: 0.1, alSectoralAssemblyAllowed: true },
];

/**
 * TABLE 2 — Stranded conductors, Class 2 (Clauses 6.2.3, 6.3.3, 7.3.1). The workhorse table.
 *
 * Wire counts are MINIMA ("shall be not less than"), and differ between non-compacted circular
 * and compacted/shaped construction — a compacted 70 sq mm Al needs only 12 wires where the
 * non-compacted circular form needs 19.
 */
export interface StrandedConductorRow {
  csaSqMm: number;
  /** Minimum wires, circular non-compacted. null = not specified for that material. */
  minWiresCircularCu: number | null;
  minWiresCircularAl: number | null;
  /** Minimum wires, compacted circular or shaped. */
  minWiresCompactedCu: number | null;
  minWiresCompactedAl: number | null;
  cuPlainOhmPerKm: number | null;
  cuTinnedOhmPerKm: number | null;
  alOhmPerKm: number | null;
  /** Footnote 1: 800 and 1000 sq mm are segmental conductors. */
  segmental?: boolean;
  /** Footnote 2: may be stranded or segmental. */
  strandedOrSegmental?: boolean;
  /** Footnote 3: wire count unspecified; may be 4, 5 or 6 equal segments (Milliken). */
  millikenSegments?: boolean;
}

export const IS8130_2013_TABLE2_STRANDED: ReadonlyArray<StrandedConductorRow> = [
  { csaSqMm: 1, minWiresCircularCu: 3, minWiresCircularAl: null, minWiresCompactedCu: null, minWiresCompactedAl: null, cuPlainOhmPerKm: 18.1, cuTinnedOhmPerKm: 18.2, alOhmPerKm: null },
  { csaSqMm: 1.5, minWiresCircularCu: 3, minWiresCircularAl: 3, minWiresCompactedCu: null, minWiresCompactedAl: null, cuPlainOhmPerKm: 12.1, cuTinnedOhmPerKm: 12.2, alOhmPerKm: 18.1 },
  { csaSqMm: 2.5, minWiresCircularCu: 3, minWiresCircularAl: 3, minWiresCompactedCu: null, minWiresCompactedAl: null, cuPlainOhmPerKm: 7.41, cuTinnedOhmPerKm: 7.56, alOhmPerKm: 12.1 },
  { csaSqMm: 4, minWiresCircularCu: 7, minWiresCircularAl: 3, minWiresCompactedCu: null, minWiresCompactedAl: null, cuPlainOhmPerKm: 4.61, cuTinnedOhmPerKm: 4.7, alOhmPerKm: 7.41 },
  { csaSqMm: 6, minWiresCircularCu: 7, minWiresCircularAl: 3, minWiresCompactedCu: null, minWiresCompactedAl: null, cuPlainOhmPerKm: 3.08, cuTinnedOhmPerKm: 3.11, alOhmPerKm: 4.61 },
  { csaSqMm: 10, minWiresCircularCu: 7, minWiresCircularAl: 7, minWiresCompactedCu: 6, minWiresCompactedAl: null, cuPlainOhmPerKm: 1.83, cuTinnedOhmPerKm: 1.84, alOhmPerKm: 3.08 },
  { csaSqMm: 16, minWiresCircularCu: 7, minWiresCircularAl: 7, minWiresCompactedCu: 6, minWiresCompactedAl: 6, cuPlainOhmPerKm: 1.15, cuTinnedOhmPerKm: 1.16, alOhmPerKm: 1.91 },
  { csaSqMm: 25, minWiresCircularCu: 7, minWiresCircularAl: 7, minWiresCompactedCu: 6, minWiresCompactedAl: 6, cuPlainOhmPerKm: 0.727, cuTinnedOhmPerKm: 0.734, alOhmPerKm: 1.2 },
  { csaSqMm: 35, minWiresCircularCu: 7, minWiresCircularAl: 7, minWiresCompactedCu: 6, minWiresCompactedAl: 6, cuPlainOhmPerKm: 0.524, cuTinnedOhmPerKm: 0.529, alOhmPerKm: 0.868 },
  { csaSqMm: 50, minWiresCircularCu: 19, minWiresCircularAl: 19, minWiresCompactedCu: 6, minWiresCompactedAl: 6, cuPlainOhmPerKm: 0.387, cuTinnedOhmPerKm: 0.391, alOhmPerKm: 0.641 },
  { csaSqMm: 70, minWiresCircularCu: 19, minWiresCircularAl: 19, minWiresCompactedCu: 12, minWiresCompactedAl: 12, cuPlainOhmPerKm: 0.268, cuTinnedOhmPerKm: 0.27, alOhmPerKm: 0.443 },
  { csaSqMm: 95, minWiresCircularCu: 19, minWiresCircularAl: 19, minWiresCompactedCu: 15, minWiresCompactedAl: 15, cuPlainOhmPerKm: 0.193, cuTinnedOhmPerKm: 0.195, alOhmPerKm: 0.32 },
  { csaSqMm: 120, minWiresCircularCu: 37, minWiresCircularAl: 37, minWiresCompactedCu: 18, minWiresCompactedAl: 15, cuPlainOhmPerKm: 0.153, cuTinnedOhmPerKm: 0.154, alOhmPerKm: 0.253 },
  { csaSqMm: 150, minWiresCircularCu: 37, minWiresCircularAl: 37, minWiresCompactedCu: 18, minWiresCompactedAl: 15, cuPlainOhmPerKm: 0.124, cuTinnedOhmPerKm: 0.126, alOhmPerKm: 0.206 },
  { csaSqMm: 185, minWiresCircularCu: 37, minWiresCircularAl: 37, minWiresCompactedCu: 30, minWiresCompactedAl: 30, cuPlainOhmPerKm: 0.0991, cuTinnedOhmPerKm: 0.1, alOhmPerKm: 0.164 },
  { csaSqMm: 240, minWiresCircularCu: 61, minWiresCircularAl: 37, minWiresCompactedCu: 34, minWiresCompactedAl: 30, cuPlainOhmPerKm: 0.0754, cuTinnedOhmPerKm: 0.0762, alOhmPerKm: 0.125 },
  { csaSqMm: 300, minWiresCircularCu: 61, minWiresCircularAl: 61, minWiresCompactedCu: 34, minWiresCompactedAl: 30, cuPlainOhmPerKm: 0.0601, cuTinnedOhmPerKm: 0.0607, alOhmPerKm: 0.1 },
  { csaSqMm: 400, minWiresCircularCu: 61, minWiresCircularAl: 61, minWiresCompactedCu: 53, minWiresCompactedAl: 53, cuPlainOhmPerKm: 0.047, cuTinnedOhmPerKm: 0.0475, alOhmPerKm: 0.0778 },
  { csaSqMm: 500, minWiresCircularCu: 61, minWiresCircularAl: 61, minWiresCompactedCu: 53, minWiresCompactedAl: 53, cuPlainOhmPerKm: 0.0366, cuTinnedOhmPerKm: 0.0369, alOhmPerKm: 0.0605 },
  { csaSqMm: 630, minWiresCircularCu: 91, minWiresCircularAl: 91, minWiresCompactedCu: 53, minWiresCompactedAl: 53, cuPlainOhmPerKm: 0.0283, cuTinnedOhmPerKm: 0.0286, alOhmPerKm: 0.0469 },
  { csaSqMm: 800, minWiresCircularCu: 91, minWiresCircularAl: 91, minWiresCompactedCu: 53, minWiresCompactedAl: 53, cuPlainOhmPerKm: 0.0221, cuTinnedOhmPerKm: 0.0224, alOhmPerKm: 0.0367, segmental: true },
  { csaSqMm: 1000, minWiresCircularCu: 91, minWiresCircularAl: 91, minWiresCompactedCu: 53, minWiresCompactedAl: 53, cuPlainOhmPerKm: 0.0176, cuTinnedOhmPerKm: 0.0177, alOhmPerKm: 0.0291, segmental: true },
  { csaSqMm: 1200, minWiresCircularCu: null, minWiresCircularAl: null, minWiresCompactedCu: null, minWiresCompactedAl: null, cuPlainOhmPerKm: 0.0151, cuTinnedOhmPerKm: 0.0151, alOhmPerKm: 0.0247, strandedOrSegmental: true, millikenSegments: true },
  { csaSqMm: 1400, minWiresCircularCu: null, minWiresCircularAl: null, minWiresCompactedCu: null, minWiresCompactedAl: null, cuPlainOhmPerKm: 0.0129, cuTinnedOhmPerKm: 0.0129, alOhmPerKm: 0.0212, strandedOrSegmental: true, millikenSegments: true },
  { csaSqMm: 1600, minWiresCircularCu: null, minWiresCircularAl: null, minWiresCompactedCu: null, minWiresCompactedAl: null, cuPlainOhmPerKm: 0.0113, cuTinnedOhmPerKm: 0.0113, alOhmPerKm: 0.0186, strandedOrSegmental: true, millikenSegments: true },
  { csaSqMm: 1800, minWiresCircularCu: null, minWiresCircularAl: null, minWiresCompactedCu: null, minWiresCompactedAl: null, cuPlainOhmPerKm: 0.0101, cuTinnedOhmPerKm: 0.0101, alOhmPerKm: 0.0165, strandedOrSegmental: true, millikenSegments: true },
  { csaSqMm: 2000, minWiresCircularCu: null, minWiresCircularAl: null, minWiresCompactedCu: null, minWiresCompactedAl: null, cuPlainOhmPerKm: 0.009, cuTinnedOhmPerKm: 0.009, alOhmPerKm: 0.0149, strandedOrSegmental: true, millikenSegments: true },
  { csaSqMm: 2500, minWiresCircularCu: null, minWiresCircularAl: null, minWiresCompactedCu: null, minWiresCompactedAl: null, cuPlainOhmPerKm: 0.0072, cuTinnedOhmPerKm: 0.0072, alOhmPerKm: 0.0127, strandedOrSegmental: true, millikenSegments: true },
];

/** Rows for Tables 3-5: MAXIMUM permitted wire diameter, plus resistance. */
export interface FlexibleConductorRow {
  csaSqMm: number;
  maxWireDiaMm: number;
  plainOhmPerKm: number;
  tinnedOhmPerKm?: number;
}

/** TABLE 3 — Flexible copper conductors, Class 5 (Clauses 6.4.3, 7.3.1). */
export const IS8130_2013_TABLE3_CLASS5: ReadonlyArray<FlexibleConductorRow> = [
  { csaSqMm: 0.5, maxWireDiaMm: 0.21, plainOhmPerKm: 39.0, tinnedOhmPerKm: 40.1 },
  { csaSqMm: 0.75, maxWireDiaMm: 0.21, plainOhmPerKm: 26.0, tinnedOhmPerKm: 26.7 },
  { csaSqMm: 1, maxWireDiaMm: 0.21, plainOhmPerKm: 19.5, tinnedOhmPerKm: 20.0 },
  { csaSqMm: 1.5, maxWireDiaMm: 0.26, plainOhmPerKm: 13.3, tinnedOhmPerKm: 13.7 },
  { csaSqMm: 2.5, maxWireDiaMm: 0.26, plainOhmPerKm: 7.98, tinnedOhmPerKm: 8.21 },
  { csaSqMm: 4, maxWireDiaMm: 0.31, plainOhmPerKm: 4.95, tinnedOhmPerKm: 5.09 },
  { csaSqMm: 6, maxWireDiaMm: 0.31, plainOhmPerKm: 3.3, tinnedOhmPerKm: 3.39 },
  { csaSqMm: 10, maxWireDiaMm: 0.41, plainOhmPerKm: 1.91, tinnedOhmPerKm: 1.95 },
  { csaSqMm: 16, maxWireDiaMm: 0.41, plainOhmPerKm: 1.21, tinnedOhmPerKm: 1.24 },
  { csaSqMm: 25, maxWireDiaMm: 0.41, plainOhmPerKm: 0.78, tinnedOhmPerKm: 0.795 },
  { csaSqMm: 35, maxWireDiaMm: 0.41, plainOhmPerKm: 0.554, tinnedOhmPerKm: 0.565 },
  { csaSqMm: 50, maxWireDiaMm: 0.41, plainOhmPerKm: 0.386, tinnedOhmPerKm: 0.393 },
  { csaSqMm: 70, maxWireDiaMm: 0.51, plainOhmPerKm: 0.272, tinnedOhmPerKm: 0.277 },
  { csaSqMm: 95, maxWireDiaMm: 0.51, plainOhmPerKm: 0.206, tinnedOhmPerKm: 0.21 },
  { csaSqMm: 120, maxWireDiaMm: 0.51, plainOhmPerKm: 0.161, tinnedOhmPerKm: 0.164 },
  { csaSqMm: 150, maxWireDiaMm: 0.51, plainOhmPerKm: 0.129, tinnedOhmPerKm: 0.132 },
  { csaSqMm: 185, maxWireDiaMm: 0.51, plainOhmPerKm: 0.106, tinnedOhmPerKm: 0.108 },
  { csaSqMm: 240, maxWireDiaMm: 0.51, plainOhmPerKm: 0.0801, tinnedOhmPerKm: 0.0817 },
  { csaSqMm: 300, maxWireDiaMm: 0.51, plainOhmPerKm: 0.0641, tinnedOhmPerKm: 0.0654 },
  { csaSqMm: 400, maxWireDiaMm: 0.51, plainOhmPerKm: 0.0486, tinnedOhmPerKm: 0.0495 },
  { csaSqMm: 500, maxWireDiaMm: 0.61, plainOhmPerKm: 0.0384, tinnedOhmPerKm: 0.0391 },
  { csaSqMm: 630, maxWireDiaMm: 0.61, plainOhmPerKm: 0.0287, tinnedOhmPerKm: 0.0292 },
];

/**
 * TABLE 4 — Flexible copper conductors, Class 6 (Clauses 6.4.3, 7.3.1).
 * Same resistances as Class 5; finer wires (Class 6 is the more flexible class).
 */
export const IS8130_2013_TABLE4_CLASS6: ReadonlyArray<FlexibleConductorRow> = [
  { csaSqMm: 0.5, maxWireDiaMm: 0.16, plainOhmPerKm: 39.0, tinnedOhmPerKm: 40.1 },
  { csaSqMm: 0.75, maxWireDiaMm: 0.16, plainOhmPerKm: 26.0, tinnedOhmPerKm: 26.7 },
  { csaSqMm: 1, maxWireDiaMm: 0.16, plainOhmPerKm: 19.5, tinnedOhmPerKm: 20.0 },
  { csaSqMm: 1.5, maxWireDiaMm: 0.16, plainOhmPerKm: 13.3, tinnedOhmPerKm: 13.7 },
  { csaSqMm: 2.5, maxWireDiaMm: 0.16, plainOhmPerKm: 7.98, tinnedOhmPerKm: 8.21 },
  { csaSqMm: 4, maxWireDiaMm: 0.16, plainOhmPerKm: 4.95, tinnedOhmPerKm: 5.09 },
  { csaSqMm: 6, maxWireDiaMm: 0.21, plainOhmPerKm: 3.3, tinnedOhmPerKm: 3.39 },
  { csaSqMm: 10, maxWireDiaMm: 0.21, plainOhmPerKm: 1.91, tinnedOhmPerKm: 1.95 },
  { csaSqMm: 16, maxWireDiaMm: 0.21, plainOhmPerKm: 1.21, tinnedOhmPerKm: 1.24 },
  { csaSqMm: 25, maxWireDiaMm: 0.21, plainOhmPerKm: 0.78, tinnedOhmPerKm: 0.795 },
  { csaSqMm: 35, maxWireDiaMm: 0.21, plainOhmPerKm: 0.554, tinnedOhmPerKm: 0.565 },
  { csaSqMm: 50, maxWireDiaMm: 0.31, plainOhmPerKm: 0.386, tinnedOhmPerKm: 0.393 },
  { csaSqMm: 70, maxWireDiaMm: 0.31, plainOhmPerKm: 0.272, tinnedOhmPerKm: 0.277 },
  { csaSqMm: 95, maxWireDiaMm: 0.31, plainOhmPerKm: 0.206, tinnedOhmPerKm: 0.21 },
  { csaSqMm: 120, maxWireDiaMm: 0.31, plainOhmPerKm: 0.161, tinnedOhmPerKm: 0.164 },
  { csaSqMm: 150, maxWireDiaMm: 0.31, plainOhmPerKm: 0.129, tinnedOhmPerKm: 0.132 },
  { csaSqMm: 185, maxWireDiaMm: 0.41, plainOhmPerKm: 0.106, tinnedOhmPerKm: 0.108 },
  { csaSqMm: 240, maxWireDiaMm: 0.41, plainOhmPerKm: 0.0801, tinnedOhmPerKm: 0.0817 },
  { csaSqMm: 300, maxWireDiaMm: 0.41, plainOhmPerKm: 0.0641, tinnedOhmPerKm: 0.0654 },
];

/** TABLE 5 — Flexible aluminium conductors for welding cables (Clauses 6.5.3, 7.3.1). */
export const IS8130_2013_TABLE5_WELDING_AL: ReadonlyArray<FlexibleConductorRow> = [
  { csaSqMm: 25, maxWireDiaMm: 0.31, plainOhmPerKm: 1.23 },
  { csaSqMm: 35, maxWireDiaMm: 0.31, plainOhmPerKm: 0.901 },
  { csaSqMm: 50, maxWireDiaMm: 0.31, plainOhmPerKm: 0.634 },
  { csaSqMm: 70, maxWireDiaMm: 0.31, plainOhmPerKm: 0.445 },
  { csaSqMm: 95, maxWireDiaMm: 0.31, plainOhmPerKm: 0.334 },
  { csaSqMm: 120, maxWireDiaMm: 0.31, plainOhmPerKm: 0.256 },
];

/**
 * TABLE 6 — Temperature correction factors k_t (Clause 7.3), 5-50 °C.
 *
 * Generated from the standard's own printed formula k_t = 250 / (230 + t) rather than transcribed,
 * because 46 hand-copied three-decimal numbers is a transcription-error surface for no benefit.
 * A test checks the generated values against every printed figure.
 */
export function temperatureCorrectionFactor(tCelsius: number): number {
  if (tCelsius < 5 || tCelsius > 50) {
    throw new StandardsLookupError("IS8130", "Table 6", "temperatureCelsius", tCelsius);
  }
  return Math.round((250 / (230 + tCelsius)) * 1000) / 1000;
}

/** §7.3 — correct a measured resistance at t °C to its 20 °C equivalent. */
export function correctResistanceTo20C(measuredOhmPerKm: number, tCelsius: number): number {
  return measuredOhmPerKm * temperatureCorrectionFactor(tCelsius);
}

export interface ConductorLookup {
  csaSqMm: number;
  material: ConductorMaterialCode;
  klass: IS8130Class;
  /** Class 2 only: compacted/shaped needs fewer wires than circular non-compacted. */
  form?: ConductorForm;
  /** Copper only. Tinned resistance is slightly higher. */
  tinned?: boolean;
}

export interface ConductorSpec {
  csaSqMm: number;
  maxDcResistanceOhmPerKm: number;
  /** Class 1/2: minimum wires. Class 1 is solid so always 1. */
  minWires?: number;
  /** Class 5/6/welding: maximum permitted individual wire diameter. */
  maxWireDiaMm?: number;
  notes: string[];
  ref: string;
}

/**
 * Resolve a conductor against the right table.
 *
 * Returns resistance, and either a minimum wire count or a maximum wire diameter — NEVER a
 * conductor diameter, because the standard does not specify one for fixed-installation classes.
 * Throws on any combination the standard leaves blank rather than substituting a neighbour.
 */
export function findConductor(lookup: ConductorLookup): ConductorSpec {
  const { csaSqMm, material, klass, tinned = false } = lookup;
  const notes: string[] = [];

  if (klass === "Class 1") {
    const row = IS8130_2013_TABLE1_SOLID.find((r) => r.csaSqMm === csaSqMm);
    if (!row) throw new StandardsLookupError("IS8130", "Table 1", "csaSqMm", csaSqMm);
    const r = material === "AL" ? row.alOhmPerKm : tinned ? row.cuTinnedOhmPerKm : row.cuPlainOhmPerKm;
    if (r === null) {
      throw new StandardsLookupError(
        "IS8130",
        `Table 1 (${material === "AL" ? "aluminium" : tinned ? "tinned copper" : "plain copper"}, solid)`,
        "csaSqMm",
        csaSqMm,
      );
    }
    if (material === "CU" && row.cuSpecialPurpose) {
      notes.push("Solid copper of 25 sq mm and above is for particular cable types only, not general purpose (Table 1, footnote 1).");
    }
    if (material === "AL" && row.alCircularOnly) {
      notes.push("Aluminium 10-35 sq mm shall be circular only (§6.1.3, Table 1 footnote 2).");
    }
    if (material === "AL" && row.alSectoralAssemblyAllowed) {
      notes.push("For single-core cables, four sectoral shaped conductors may be assembled into one circular conductor (Table 1, footnote 3).");
    }
    return { csaSqMm, maxDcResistanceOhmPerKm: r, minWires: 1, notes, ref: `IS 8130 : 2013, Table 1 (${csaSqMm} sq mm)` };
  }

  if (klass === "Class 2") {
    const row = IS8130_2013_TABLE2_STRANDED.find((r) => r.csaSqMm === csaSqMm);
    if (!row) throw new StandardsLookupError("IS8130", "Table 2", "csaSqMm", csaSqMm);
    const r = material === "AL" ? row.alOhmPerKm : tinned ? row.cuTinnedOhmPerKm : row.cuPlainOhmPerKm;
    if (r === null) {
      throw new StandardsLookupError("IS8130", `Table 2 (${material === "AL" ? "aluminium" : "copper"})`, "csaSqMm", csaSqMm);
    }
    const form = lookup.form ?? "circular-non-compacted";
    const compacted = form === "compacted-or-shaped";
    const minWires = material === "AL"
      ? compacted ? row.minWiresCompactedAl : row.minWiresCircularAl
      : compacted ? row.minWiresCompactedCu : row.minWiresCircularCu;

    if (minWires === null && !row.millikenSegments) {
      throw new StandardsLookupError("IS8130", `Table 2 (min wires, ${material}, ${form})`, "csaSqMm", csaSqMm);
    }
    if (row.segmental) notes.push("This size is a segmental conductor (Table 2, footnote 1).");
    if (row.strandedOrSegmental) notes.push("May be stranded or segmental (Table 2, footnote 2).");
    if (row.millikenSegments) {
      notes.push("Minimum wire count not specified; may be constructed from 4, 5 or 6 equal segments — Milliken (Table 2, footnote 3).");
    }
    return {
      csaSqMm,
      maxDcResistanceOhmPerKm: r,
      minWires: minWires ?? undefined,
      notes,
      ref: `IS 8130 : 2013, Table 2 (${csaSqMm} sq mm, ${material === "AL" ? "Al" : "Cu"}, ${compacted ? "compacted/shaped" : "circular"})`,
    };
  }

  const { table, tableName } =
    klass === "Class 5" ? { table: IS8130_2013_TABLE3_CLASS5, tableName: "Table 3" }
    : klass === "Class 6" ? { table: IS8130_2013_TABLE4_CLASS6, tableName: "Table 4" }
    : { table: IS8130_2013_TABLE5_WELDING_AL, tableName: "Table 5" };

  if (klass !== "Welding Al" && material !== "CU") {
    throw new StandardsLookupError("IS8130", `${tableName} (copper only)`, "material", material);
  }
  if (klass === "Welding Al" && material !== "AL") {
    throw new StandardsLookupError("IS8130", "Table 5 (aluminium only)", "material", material);
  }

  const row = table.find((r) => r.csaSqMm === csaSqMm);
  if (!row) throw new StandardsLookupError("IS8130", tableName, "csaSqMm", csaSqMm);
  const r = tinned ? row.tinnedOhmPerKm ?? row.plainOhmPerKm : row.plainOhmPerKm;
  notes.push("Wire diameter shown is the MAXIMUM permitted, not a nominal dimension.");
  return {
    csaSqMm,
    maxDcResistanceOhmPerKm: r,
    maxWireDiaMm: row.maxWireDiaMm,
    notes,
    ref: `IS 8130 : 2013, ${tableName} (${csaSqMm} sq mm)`,
  };
}

/**
 * Why no conductor-diameter accessor exists here. Surfaced in the UI wherever an actual
 * (non-fictitious) conductor diameter is shown, so the operator knows where the number came from.
 */
export const conductorDiameterNote =
  "IS 8130 specifies no conductor diameter — a conductor conforms by maximum resistance (§3.2). " +
  "Use IS 10462 (Part 1) for the fictitious diameter that sizes sheaths and armour, or works " +
  "data for the actual measured diameter.";

/** Sizes available as Class 2 stranded — the offerable set for fixed-installation cables. */
export const IS8130_2013_CLASS2_SIZES: number[] = IS8130_2013_TABLE2_STRANDED.map((r) => r.csaSqMm);

/**
 * Class 2 ALUMINIUM sizes — Al has no 1 sq mm row, and the Milliken sizes have no wire count.
 * This is the set AB cable and LT power pick from.
 */
export const IS8130_2013_CLASS2_AL_SIZES: number[] = IS8130_2013_TABLE2_STRANDED
  .filter((r) => r.alOhmPerKm !== null && r.minWiresCircularAl !== null)
  .map((r) => r.csaSqMm);

/** Kept for compatibility with the size pickers; now backed by the real Table 2 Al column. */
export const IS8130_2013_ENCODED_SIZES: number[] = IS8130_2013_CLASS2_AL_SIZES;

export const IS8130_2013_EDITION = "2013";
