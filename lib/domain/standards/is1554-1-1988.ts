/**
 * IS 1554 (Part 1) : 1988 — PVC insulated (heavy duty) electric cables, working voltages up to
 * and including 1 100 V. Third Revision. Reaffirmed 2015, 2020.
 *
 * This is the CONTROL CABLE standard (§1.1: "for electric supply AND CONTROL purposes"), and
 * also the PVC-insulated LT power standard.
 *
 * As with IS 7098-1, only what is unique to this standard lives here — the inner sheath, armour
 * and outer sheath tables are shared and live in protective-coverings.ts.
 *
 * ─── PVC vs XLPE, in one line ─────────────────────────────────────────────────────────────────
 *
 * PVC insulation is THICKER than XLPE at the same conductor size (1.5 sq mm: 1.1/0.8 mm here vs
 * 1.0/0.7 mm in IS 7098-1) and runs COOLER (70 °C vs 90 °C continuous). Both differences follow
 * from the material, and both matter to the derived cable, which is why these tables cannot be
 * shared with the XLPE standard even though the sheath tables can.
 *
 * Encoding status: DRAFT pending human row-by-row verification per the encoding SOP.
 */
import type { ConductorMaterialCode } from "./is8130-2013";
import type { StandardsDataset } from "./types";
import { StandardsLookupError } from "./types";

export const IS1554_1_1988: StandardsDataset = {
  standardId: "IS1554-1",
  edition: "1988",
  body: "BIS",
  title:
    "Specification for PVC insulated (heavy duty) electric cables, Part 1: For working voltages up to and including 1 100 V (Third Revision)",
  status: "draft",
  reaffirmed: "2020",
  sourceFile: "1554_1_1988_reff2020_PVC_LT_Alcontrol.pdf",
  coverageNote:
    "Table 2 (insulation), Table 1 (reduced neutral), Table 3 (lay-up) and Table 6 (armour " +
    "resistance) encoded here; Tables 4/5/7 (inner sheath, armour dimensions, outer sheath) are " +
    "in protective-coverings.ts, shared with IS 7098-1.",
};

/** §1.3 — thermal ratings. Two insulation grades, and the purchaser picks. */
export const IS1554_1_THERMAL = {
  generalPurpose: { maxContinuousConductorTempC: 70, maxShortCircuitConductorTempC: 160, pvcType: "Type A" },
  heatResisting: { maxContinuousConductorTempC: 85, maxShortCircuitConductorTempC: 160, pvcType: "Type C" },
  ref: "IS 1554 (Part 1) : 1988, §1.3 and §4.1",
} as const;

export type PvcInsulationGrade = "general-purpose" | "heat-resisting";

/**
 * TABLE 2 — Nominal thickness of insulation (Clauses 9.2, 9.3).
 *
 * Same two-column shape as IS 7098-1 Table 3: single-core ARMOURED gets the thicker column.
 */
export interface PvcInsulationRow {
  csaSqMm: number;
  singleCoreArmouredMm: number;
  unarmouredOrMulticoreMm: number;
}

export const IS1554_1_TABLE2_INSULATION: ReadonlyArray<PvcInsulationRow> = [
  { csaSqMm: 1.5, singleCoreArmouredMm: 1.1, unarmouredOrMulticoreMm: 0.8 },
  { csaSqMm: 2.5, singleCoreArmouredMm: 1.2, unarmouredOrMulticoreMm: 0.9 },
  { csaSqMm: 4, singleCoreArmouredMm: 1.3, unarmouredOrMulticoreMm: 1.0 },
  { csaSqMm: 6, singleCoreArmouredMm: 1.3, unarmouredOrMulticoreMm: 1.0 },
  { csaSqMm: 10, singleCoreArmouredMm: 1.3, unarmouredOrMulticoreMm: 1.0 },
  { csaSqMm: 16, singleCoreArmouredMm: 1.3, unarmouredOrMulticoreMm: 1.0 },
  { csaSqMm: 25, singleCoreArmouredMm: 1.5, unarmouredOrMulticoreMm: 1.2 },
  { csaSqMm: 35, singleCoreArmouredMm: 1.5, unarmouredOrMulticoreMm: 1.2 },
  { csaSqMm: 50, singleCoreArmouredMm: 1.7, unarmouredOrMulticoreMm: 1.4 },
  { csaSqMm: 70, singleCoreArmouredMm: 1.7, unarmouredOrMulticoreMm: 1.4 },
  { csaSqMm: 95, singleCoreArmouredMm: 1.9, unarmouredOrMulticoreMm: 1.6 },
  { csaSqMm: 120, singleCoreArmouredMm: 1.9, unarmouredOrMulticoreMm: 1.6 },
  { csaSqMm: 150, singleCoreArmouredMm: 2.1, unarmouredOrMulticoreMm: 1.8 },
  { csaSqMm: 185, singleCoreArmouredMm: 2.3, unarmouredOrMulticoreMm: 2.0 },
  { csaSqMm: 240, singleCoreArmouredMm: 2.5, unarmouredOrMulticoreMm: 2.2 },
  { csaSqMm: 300, singleCoreArmouredMm: 2.7, unarmouredOrMulticoreMm: 2.4 },
  { csaSqMm: 400, singleCoreArmouredMm: 3.0, unarmouredOrMulticoreMm: 2.6 },
  { csaSqMm: 500, singleCoreArmouredMm: 3.4, unarmouredOrMulticoreMm: 3.0 },
  { csaSqMm: 630, singleCoreArmouredMm: 3.9, unarmouredOrMulticoreMm: 3.4 },
  { csaSqMm: 800, singleCoreArmouredMm: 3.9, unarmouredOrMulticoreMm: 3.4 },
  { csaSqMm: 1000, singleCoreArmouredMm: 3.9, unarmouredOrMulticoreMm: 3.4 },
];

/**
 * TABLE 1 — Cross-sectional area of reduced neutral conductors (Clause 8.2).
 * Identical values to IS 7098-1 Table 2, but cited from this standard for PVC cables.
 */
export const IS1554_1_TABLE1_REDUCED_NEUTRAL: ReadonlyArray<{ phaseSqMm: number; neutralSqMm: number }> = [
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

/** §9.2 / Table 2 — nominal insulation thickness. */
export function pvcInsulationThickness(lookup: {
  csaSqMm: number;
  coreCount: number;
  armoured: boolean;
}): { nominalMm: number; ref: string; column: string } {
  const row = IS1554_1_TABLE2_INSULATION.find((r) => r.csaSqMm === lookup.csaSqMm);
  if (!row) throw new StandardsLookupError("IS1554-1", "Table 2", "csaSqMm", lookup.csaSqMm);
  const singleCoreArmoured = lookup.coreCount === 1 && lookup.armoured;
  return {
    nominalMm: singleCoreArmoured ? row.singleCoreArmouredMm : row.unarmouredOrMulticoreMm,
    column: singleCoreArmoured ? "single-core armoured" : "single-core unarmoured / multi-core",
    ref: `IS 1554 (Part 1) : 1988, Table 2 (${lookup.csaSqMm} sq mm)`,
  };
}

/** §8.2 / Table 1 — reduced-neutral size. */
export function reducedNeutralSize(phaseSqMm: number): { neutralSqMm: number; ref: string } {
  const row = IS1554_1_TABLE1_REDUCED_NEUTRAL.find((r) => r.phaseSqMm === phaseSqMm);
  if (!row) throw new StandardsLookupError("IS1554-1", "Table 1", "phaseSqMm", phaseSqMm);
  return { neutralSqMm: row.neutralSqMm, ref: `IS 1554 (Part 1) : 1988, Table 1 (${phaseSqMm} sq mm)` };
}

/**
 * §8.1 — conductor construction. NOTE the thresholds differ from IS 7098-1: aluminium is
 * stranded from 16 sq mm in both, but the copper solid/stranded band here runs 1.5-6 sq mm.
 */
export function conductorConstruction(csaSqMm: number, material: ConductorMaterialCode): {
  form: "solid" | "solid-or-stranded" | "stranded";
  klass: "Class 1" | "Class 2";
  ref: string;
} {
  const ref = "IS 1554 (Part 1) : 1988, §8.1";
  if (material === "AL") {
    if (csaSqMm < 1.5) throw new StandardsLookupError("IS1554-1", "§8.1", "csaSqMm (Al)", csaSqMm);
    if (csaSqMm === 1.5) return { form: "solid", klass: "Class 1", ref };
    if (csaSqMm <= 10) return { form: "solid-or-stranded", klass: "Class 2", ref };
    return { form: "stranded", klass: "Class 2", ref };
  }
  if (csaSqMm < 1.5) throw new StandardsLookupError("IS1554-1", "§8.1", "csaSqMm (Cu)", csaSqMm);
  if (csaSqMm <= 6) return { form: "solid-or-stranded", klass: "Class 2", ref };
  return { form: "stranded", klass: "Class 2", ref };
}

/**
 * §10.1 — core identification by colour. Control cables run to many cores, so beyond 5 the
 * standard switches to a counting/direction pair plus grey, or to numbering (§10.3).
 */
export const IS1554_1_CORE_COLOURS: Readonly<Record<number, string[]>> = {
  1: ["red", "black", "yellow", "blue", "natural"],
  2: ["red", "black"],
  3: ["red", "yellow", "blue"],
  4: ["red", "yellow", "blue", "black"],
  5: ["red", "yellow", "blue", "black", "grey"],
};

/** §10.1(f) — 6 cores and above. §10.2: a reduced neutral is always black. */
export const IS1554_1_MANY_CORE_RULE =
  "Two adjacent cores (counting and direction core) in each layer blue and yellow, remaining cores grey; " +
  "or sequential numbering per §10.3.";

export const IS1554_1_REDUCED_NEUTRAL_COLOUR = "black";

/**
 * TABLE 6 — Maximum dc resistance of armour at 20 °C (Clause 13.5.1), ohm/km.
 *
 * Unique to this standard — IS 7098-1:2025 dropped its equivalent table and instead says the
 * result "shall comply with the value declared by the purchaser" (§14.5.1).
 *
 * `null` where the printed table shows a dash: that armour type is not offered at that size.
 * Single-core cables are absent by design (Note 1 — they are normally non-magnetic armoured).
 */
export interface ArmourResistanceRow {
  csaSqMm: number;
  twoCore: { roundWire: number | null; strip4x08: number | null; strip61x14: number | null };
  threeCore: { roundWire: number | null; strip4x08: number | null; strip61x14: number | null };
  fourCore: { roundWire: number | null; strip4x08: number | null; strip61x14: number | null };
}

export const IS1554_1_TABLE6_ARMOUR_RESISTANCE: ReadonlyArray<ArmourResistanceRow> = [
  { csaSqMm: 1.5, twoCore: { roundWire: 6.37, strip4x08: null, strip61x14: null }, threeCore: { roundWire: 6.02, strip4x08: null, strip61x14: null }, fourCore: { roundWire: 5.52, strip4x08: null, strip61x14: null } },
  { csaSqMm: 2.5, twoCore: { roundWire: 5.54, strip4x08: null, strip61x14: null }, threeCore: { roundWire: 5.22, strip4x08: null, strip61x14: null }, fourCore: { roundWire: 4.77, strip4x08: null, strip61x14: null } },
  { csaSqMm: 4, twoCore: { roundWire: 4.83, strip4x08: null, strip61x14: null }, threeCore: { roundWire: 4.54, strip4x08: null, strip61x14: null }, fourCore: { roundWire: 4.14, strip4x08: null, strip61x14: null } },
  { csaSqMm: 6, twoCore: { roundWire: 4.4, strip4x08: null, strip61x14: null }, threeCore: { roundWire: 4.14, strip4x08: null, strip61x14: null }, fourCore: { roundWire: 3.76, strip4x08: null, strip61x14: null } },
  { csaSqMm: 10, twoCore: { roundWire: 3.86, strip4x08: null, strip61x14: null }, threeCore: { roundWire: 3.62, strip4x08: null, strip61x14: null }, fourCore: { roundWire: 2.84, strip4x08: 4.68, strip61x14: null } },
  { csaSqMm: 16, twoCore: { roundWire: 2.85, strip4x08: 4.69, strip61x14: null }, threeCore: { roundWire: 2.67, strip4x08: 4.4, strip61x14: null }, fourCore: { roundWire: 2.42, strip4x08: 3.99, strip61x14: null } },
  { csaSqMm: 25, twoCore: { roundWire: 2.77, strip4x08: 4.58, strip61x14: null }, threeCore: { roundWire: 2.49, strip4x08: 4.11, strip61x14: null }, fourCore: { roundWire: 2.14, strip4x08: 3.53, strip61x14: null } },
  { csaSqMm: 35, twoCore: { roundWire: 2.67, strip4x08: 4.41, strip61x14: null }, threeCore: { roundWire: 2.35, strip4x08: 3.88, strip61x14: null }, fourCore: { roundWire: 1.99, strip4x08: 3.28, strip61x14: null } },
  { csaSqMm: 50, twoCore: { roundWire: 2.26, strip4x08: 3.73, strip61x14: null }, threeCore: { roundWire: 2.03, strip4x08: 3.35, strip61x14: null }, fourCore: { roundWire: 1.39, strip4x08: 2.92, strip61x14: null } },
  { csaSqMm: 70, twoCore: { roundWire: 2.04, strip4x08: 3.36, strip61x14: null }, threeCore: { roundWire: 1.41, strip4x08: 2.96, strip61x14: null }, fourCore: { roundWire: 1.18, strip4x08: 2.47, strip61x14: null } },
  { csaSqMm: 95, twoCore: { roundWire: 1.41, strip4x08: 2.95, strip61x14: null }, threeCore: { roundWire: 1.22, strip4x08: 2.54, strip61x14: null }, fourCore: { roundWire: 1.05, strip4x08: 2.18, strip61x14: null } },
  { csaSqMm: 120, twoCore: { roundWire: 1.3, strip4x08: 2.71, strip61x14: null }, threeCore: { roundWire: 1.11, strip4x08: 2.32, strip61x14: null }, fourCore: { roundWire: 0.962, strip4x08: 2.01, strip61x14: null } },
  { csaSqMm: 150, twoCore: { roundWire: 1.19, strip4x08: 2.49, strip61x14: null }, threeCore: { roundWire: 1.0, strip4x08: 2.09, strip61x14: null }, fourCore: { roundWire: 0.703, strip4x08: 1.86, strip61x14: 1.02 } },
  { csaSqMm: 185, twoCore: { roundWire: 1.08, strip4x08: 2.26, strip61x14: null }, threeCore: { roundWire: 0.733, strip4x08: 1.93, strip61x14: 1.06 }, fourCore: { roundWire: 0.623, strip4x08: 1.64, strip61x14: 0.902 } },
  { csaSqMm: 240, twoCore: { roundWire: 0.749, strip4x08: 1.98, strip61x14: 1.08 }, threeCore: { roundWire: 0.642, strip4x08: 1.69, strip61x14: 0.93 }, fourCore: { roundWire: 0.563, strip4x08: 1.48, strip61x14: 0.816 } },
  { csaSqMm: 300, twoCore: { roundWire: 0.684, strip4x08: 1.8, strip61x14: 0.99 }, threeCore: { roundWire: 0.586, strip4x08: 1.54, strip61x14: 0.85 }, fourCore: { roundWire: 0.389, strip4x08: 1.3, strip61x14: 0.719 } },
  { csaSqMm: 400, twoCore: { roundWire: 0.464, strip4x08: 1.56, strip61x14: 0.86 }, threeCore: { roundWire: 0.408, strip4x08: 1.36, strip61x14: 0.755 }, fourCore: { roundWire: 0.361, strip4x08: 1.2, strip61x14: 0.666 } },
  { csaSqMm: 500, twoCore: { roundWire: 0.397, strip4x08: 1.33, strip61x14: 0.734 }, threeCore: { roundWire: 0.359, strip4x08: 1.2, strip61x14: 0.663 }, fourCore: { roundWire: 0.233, strip4x08: 0.992, strip61x14: 0.552 } },
  { csaSqMm: 630, twoCore: { roundWire: 0.274, strip4x08: 1.17, strip61x14: 0.651 }, threeCore: { roundWire: 0.248, strip4x08: 1.06, strip61x14: 0.589 }, fourCore: { roundWire: 0.203, strip4x08: 0.861, strip61x14: 0.48 } },
];

export type ArmourForm = "roundWire" | "strip4x08" | "strip61x14";

/**
 * §13.5.1 / Table 6 — maximum armour dc resistance at 20 °C.
 *
 * Optional unless the purchaser asks for it (§15.4(c)), but MANDATORY for mining cables, where
 * §13.5.2 additionally caps armour resistance at 133 % of the conductor's own resistance.
 */
export function armourResistance(args: {
  csaSqMm: number;
  coreCount: 2 | 3 | 4;
  form: ArmourForm;
}): { maxOhmPerKm: number; ref: string } {
  const row = IS1554_1_TABLE6_ARMOUR_RESISTANCE.find((r) => r.csaSqMm === args.csaSqMm);
  if (!row) throw new StandardsLookupError("IS1554-1", "Table 6", "csaSqMm", args.csaSqMm);
  const group = args.coreCount === 2 ? row.twoCore : args.coreCount === 3 ? row.threeCore : row.fourCore;
  const value = group[args.form];
  if (value === null) {
    throw new StandardsLookupError("IS1554-1", `Table 6 (${args.coreCount}-core, ${args.form})`, "csaSqMm", args.csaSqMm);
  }
  return { maxOhmPerKm: value, ref: `IS 1554 (Part 1) : 1988, Table 6 (${args.csaSqMm} sq mm, ${args.coreCount}-core)` };
}

/** §13.5.2 — mining cables: armour resistance must not exceed conductor resistance by >33 %. */
export const MINING_ARMOUR_RESISTANCE_MAX_RATIO = 1.33;

/** §3.1.1 — mining cables in gassy mines must be copper. Not a preference; a requirement. */
export const IS1554_1_GASSY_MINE_CONDUCTOR: ConductorMaterialCode = "CU";

/** §17.3 — designation code letters. Same scheme as IS 7098-1 but PVC insulation is 'Y'. */
export const IS1554_1_CODE_LETTERS: Readonly<Record<string, string>> = {
  "Aluminium conductor": "A",
  "PVC insulation": "Y",
  "Steel round wire armour": "W",
  "Steel strip armour": "F",
  "Steel double round wire armour": "WW",
  "Steel double strip armour": "FF",
  "PVC outer sheath": "Y",
};

/** §17.2 — every cable to this standard is marked ELECTRIC, to distinguish it from telephone cable. */
export const IS1554_1_MANDATORY_LEGEND = "ELECTRIC";

/** Sizes with an encoded Table 2 row. */
export const IS1554_1_SIZES: number[] = IS1554_1_TABLE2_INSULATION.map((r) => r.csaSqMm);
