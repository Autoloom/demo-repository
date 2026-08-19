/**
 * IS 8130:2013 — Conductors for insulated electric cables and flexible cords.
 *
 * VERSIONED, IMMUTABLE dataset (design-doc §0.3). IS 8130:1984 is a SEPARATE module —
 * never mutate this one to "update" the standard; add a new edition file and re-pin profiles.
 * Both editions are live in the market (Haryana pins 1984, WBSEDCL pins 2013).
 *
 * Every row carries its `ref` clause string so the derivation trace is stored WITH the data.
 *
 * ⚠️ SEED STATUS: values below are the WBSEDCL PKG-30 ground truth (spec §0.5) plus the rows
 * needed for the DHBVN 16–120 mm² combos. Rows/columns marked `// GAP` need confirmation from
 * the real IS 8130:2013 PDF (open question #2, blocking for full P0-1). `strandDiaMin` and
 * `maxDcResistanceOhmPerKm` are the two columns most likely to need PDF verification.
 */

export type ConductorGrade = "H2" | "H4";
export type ConductorMaterialCode = "AL" | "CU";
export type IS8130Class = "Class 1" | "Class 2";

export interface ConductorRow {
  csaSqMm: number; // nominal cross-sectional area
  material: ConductorMaterialCode;
  klass: IS8130Class;
  grade?: ConductorGrade; // AB-cable phase conductor grade (H4 for WBSEDCL PKG-30)
  strands: number;
  strandDiaMinMm: number; // minimum individual strand diameter
  compactedDiaMm: number; // nominal compacted conductor diameter
  maxDcResistanceOhmPerKm: number; // max DC resistance at 20°C
  approxMassKgPerKm?: number; // conductor mass per km per core (± tolerance applied in CALC)
  ref: string;
}

/**
 * Class-2 stranded aluminium rows (the AB-cable phase/street-light conductors).
 * The 70 sq mm row is verified against the approved KRYFS PKG-30 GTP (§0.5).
 */
export const IS8130_2013_CLASS2_AL: ConductorRow[] = [
  {
    csaSqMm: 16,
    material: "AL",
    klass: "Class 2",
    strands: 7,
    strandDiaMinMm: 1.7, // GAP: confirm from IS 8130:2013 Table 2
    compactedDiaMm: 4.6, // GAP
    maxDcResistanceOhmPerKm: 1.91,
    ref: "IS 8130:2013, Table 2 (Class 2 Al, 16 sq mm)",
  },
  {
    csaSqMm: 25,
    material: "AL",
    klass: "Class 2",
    strands: 7,
    strandDiaMinMm: 2.13, // GAP
    compactedDiaMm: 5.8, // GAP
    maxDcResistanceOhmPerKm: 1.2,
    ref: "IS 8130:2013, Table 2 (Class 2 Al, 25 sq mm)",
  },
  {
    csaSqMm: 35,
    material: "AL",
    klass: "Class 2",
    strands: 7,
    strandDiaMinMm: 2.52, // GAP
    compactedDiaMm: 6.9, // GAP
    maxDcResistanceOhmPerKm: 0.868,
    ref: "IS 8130:2013, Table 2 (Class 2 Al, 35 sq mm)",
  },
  {
    csaSqMm: 50,
    material: "AL",
    klass: "Class 2",
    strands: 7,
    strandDiaMinMm: 3.0, // GAP
    compactedDiaMm: 8.1, // GAP — note: 50 also used as messenger (see is398-4.ts)
    maxDcResistanceOhmPerKm: 0.641,
    ref: "IS 8130:2013, Table 2 (Class 2 Al, 50 sq mm)",
  },
  {
    // ✔ VERIFIED against approved KRYFS PKG-30 GTP (spec §0.5).
    csaSqMm: 70,
    material: "AL",
    klass: "Class 2",
    grade: "H4",
    strands: 19,
    strandDiaMinMm: 2.17,
    compactedDiaMm: 9.44,
    maxDcResistanceOhmPerKm: 0.443,
    approxMassKgPerKm: 196, // ±3% (CALC tolerance)
    ref: "IS 8130:2013, Table 2 (Class 2 Al, 70 sq mm)",
  },
  {
    csaSqMm: 95,
    material: "AL",
    klass: "Class 2",
    strands: 19,
    strandDiaMinMm: 2.52, // GAP
    compactedDiaMm: 11.0, // GAP
    maxDcResistanceOhmPerKm: 0.32,
    ref: "IS 8130:2013, Table 2 (Class 2 Al, 95 sq mm)",
  },
  {
    csaSqMm: 120,
    material: "AL",
    klass: "Class 2",
    strands: 19,
    strandDiaMinMm: 2.85, // GAP
    compactedDiaMm: 12.4, // GAP
    maxDcResistanceOhmPerKm: 0.253,
    ref: "IS 8130:2013, Table 2 (Class 2 Al, 120 sq mm)",
  },
];

/** Look up a conductor row by size (Class-2 aluminium). Returns undefined if the size isn't encoded. */
export function findConductorRow(
  csaSqMm: number,
  opts: { klass?: IS8130Class; material?: ConductorMaterialCode } = {},
): ConductorRow | undefined {
  const klass = opts.klass ?? "Class 2";
  const material = opts.material ?? "AL";
  if (material === "AL" && klass === "Class 2") {
    return IS8130_2013_CLASS2_AL.find((r) => r.csaSqMm === csaSqMm);
  }
  return undefined; // GAP: Class 1 / copper tables not encoded for MVP (AB cable is Al Class 2)
}

/** The sizes this edition currently has encoded — used by the parser's "supported sizes" state. */
export const IS8130_2013_ENCODED_SIZES: number[] = IS8130_2013_CLASS2_AL.map((r) => r.csaSqMm);

export const IS8130_2013_EDITION = "2013";
