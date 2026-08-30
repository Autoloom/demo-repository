/**
 * IS 17293 : 2020 — Electric cables for photovoltaic systems for rated voltage 1 500 V d.c.
 *
 * The Indian solar cable standard, and the right citation for a GTP produced in India. It covers
 * the same ground as IEC 62930 / EN 50618 but is a BIS document with its own values, so it is
 * encoded as itself rather than as an adoption of either.
 *
 * ─── COMPLETE ─────────────────────────────────────────────────────────────────────────────────
 *
 * Unlike the IEC/EN preview extracts (see iec62930-2017.ts), this document is complete. Tables 1
 * and 2 carry all four values a solar GTP needs — insulation thickness, sheath thickness, mean
 * overall diameter, and insulation resistance at 20 °C and 90 °C — for every offered size.
 *
 * ─── Two tables, two conductor classes ────────────────────────────────────────────────────────
 *
 * §4.1 splits them by application, and the split is not cosmetic:
 *
 *   Class 5 (Table 1)  — cable connected DIRECTLY to PV modules. Flexible. 1.5 to 400 sq mm.
 *   Class 2 (Table 2)  — fixed installation NOT directly connected to the modules. 16 to 400.
 *
 * At the same conductor size the two tables give the same insulation and sheath thickness but a
 * DIFFERENT overall diameter (class 5 is bulkier — finer wires pack less densely) and a
 * different insulation resistance. Using the wrong table understates the cable.
 *
 * ─── The tolerance rules differ from IEC 62930 ────────────────────────────────────────────────
 *
 * This is the trap when working from both documents. IS 17293 uses the BIS-style additive rule,
 * NOT the IEC multiplicative one:
 *
 *   IS 17293 §5.3   insulation:  t_min = t_i − (0.1 + 0.1·t_i)      ← same shape as IS 7098-1
 *   IS 17293 §6.3   sheath:      t_min = t_s − (0.1 + 0.15·t_s)     ← note 0.15, not 0.1
 *   IEC 62930 §5.2.3 insulation: t_min = 0.9·t_s − 0.1
 *   EN 50618  §5.3.3 sheath:     t_min = 0.85·t_s − 0.1
 *
 * They are close but not equal, and the sheath coefficient here (0.15) differs from the
 * insulation one (0.1) — a distinction easy to lose. Encoded separately and tested.
 *
 * Encoding status: DRAFT pending human row-by-row verification per the encoding SOP.
 */
import type { StandardsDataset } from "./types";
import { StandardsLookupError } from "./types";

export const IS17293_2020: StandardsDataset = {
  standardId: "IS17293",
  edition: "2020",
  body: "BIS",
  title: "Electric cables for photovoltaic systems for rated voltage 1 500 V d.c.",
  status: "draft",
  sourceFile: "17293.pdf",
  coverageNote:
    "Complete. Tables 1, 2, 7, 8, 9 and the construction clauses are encoded. Test schedules " +
    "(Table 3), material property requirements (Table 11) and the test-method annexes are not — " +
    "they are conformance criteria, not derivation inputs.",
};

/** §1 — scope and thermal ratings. Same 90/120 °C split as the IEC standard. */
export const IS17293_SCOPE = {
  construction: "Single-core, cross-linked insulation and sheath",
  ratedVoltageDcV: 1500,
  /** Annex A-1: the SYSTEM must not exceed 1.8 kV, even though the cable is rated 1.5 kV. */
  maxSystemVoltageDcV: 1800,
  ratedVoltageAcV: 1000,
  maxContinuousConductorTempC: 90,
  excursionConductorTempC: 120,
  excursionMaxHours: 20000,
  /** Annex A-3 — and note this is a 5-SECOND limit, not a continuous rating. */
  shortCircuitTempC: 250,
  shortCircuitMaxSeconds: 5,
  ref: "IS 17293 : 2020, §1 and Annex A",
} as const;

/**
 * §4.1 — conductor. Annealed TINNED copper, and the class follows the application.
 * Not a free choice: directly module-connected cable must be class 5.
 */
export const IS17293_CONDUCTOR = {
  material: "CU" as const,
  tinned: true,
  perStandard: "IS 8130 : 2013",
  separatorTapePermitted: true,
  ref: "IS 17293 : 2020, §4.1",
} as const;

export type SolarConductorClass = "Class 5" | "Class 2";

/** §4.1 — which class applies. Class 2 is permitted only for fixed, non-module-connected runs. */
export function conductorClassFor(directlyConnectedToModules: boolean): {
  klass: SolarConductorClass;
  ref: string;
} {
  return directlyConnectedToModules
    ? { klass: "Class 5", ref: "IS 17293 : 2020, §4.1 (directly connected to PV module)" }
    : { klass: "Class 2", ref: "IS 17293 : 2020, §4.1 (fixed installation, not module-connected)" };
}

export interface SolarDimensionRow {
  csaSqMm: number;
  insulationThicknessMm: number;
  sheathThicknessMm: number;
  /** Marked "indicative value for information only" in both tables — NOT a guaranteed dimension. */
  meanOverallDiaMm: number;
  insulationResistanceAt20CMOhmKm: number;
  insulationResistanceAt90CMOhmKm: number;
}

/** TABLE 1 — Class 5 conductors (Clauses 6.3, 7, 11.2.3, 11.3.3). Flexible; module-connected. */
export const IS17293_TABLE1_CLASS5: ReadonlyArray<SolarDimensionRow> = [
  { csaSqMm: 1.5, insulationThicknessMm: 0.7, sheathThicknessMm: 0.8, meanOverallDiaMm: 5.4, insulationResistanceAt20CMOhmKm: 1050, insulationResistanceAt90CMOhmKm: 1.05 },
  { csaSqMm: 2.5, insulationThicknessMm: 0.7, sheathThicknessMm: 0.8, meanOverallDiaMm: 5.9, insulationResistanceAt20CMOhmKm: 862, insulationResistanceAt90CMOhmKm: 0.862 },
  { csaSqMm: 4, insulationThicknessMm: 0.7, sheathThicknessMm: 0.8, meanOverallDiaMm: 6.6, insulationResistanceAt20CMOhmKm: 709, insulationResistanceAt90CMOhmKm: 0.709 },
  { csaSqMm: 6, insulationThicknessMm: 0.7, sheathThicknessMm: 0.8, meanOverallDiaMm: 7.2, insulationResistanceAt20CMOhmKm: 610, insulationResistanceAt90CMOhmKm: 0.61 },
  { csaSqMm: 10, insulationThicknessMm: 0.7, sheathThicknessMm: 0.8, meanOverallDiaMm: 8.3, insulationResistanceAt20CMOhmKm: 489, insulationResistanceAt90CMOhmKm: 0.489 },
  { csaSqMm: 16, insulationThicknessMm: 0.7, sheathThicknessMm: 0.9, meanOverallDiaMm: 9.8, insulationResistanceAt20CMOhmKm: 393, insulationResistanceAt90CMOhmKm: 0.393 },
  { csaSqMm: 25, insulationThicknessMm: 0.9, sheathThicknessMm: 1.0, meanOverallDiaMm: 12.2, insulationResistanceAt20CMOhmKm: 395, insulationResistanceAt90CMOhmKm: 0.395 },
  { csaSqMm: 35, insulationThicknessMm: 0.9, sheathThicknessMm: 1.1, meanOverallDiaMm: 14.0, insulationResistanceAt20CMOhmKm: 335, insulationResistanceAt90CMOhmKm: 0.335 },
  { csaSqMm: 50, insulationThicknessMm: 1.0, sheathThicknessMm: 1.2, meanOverallDiaMm: 16.3, insulationResistanceAt20CMOhmKm: 314, insulationResistanceAt90CMOhmKm: 0.314 },
  { csaSqMm: 70, insulationThicknessMm: 1.1, sheathThicknessMm: 1.2, meanOverallDiaMm: 18.7, insulationResistanceAt20CMOhmKm: 291, insulationResistanceAt90CMOhmKm: 0.291 },
  { csaSqMm: 95, insulationThicknessMm: 1.1, sheathThicknessMm: 1.3, meanOverallDiaMm: 20.8, insulationResistanceAt20CMOhmKm: 258, insulationResistanceAt90CMOhmKm: 0.258 },
  { csaSqMm: 120, insulationThicknessMm: 1.2, sheathThicknessMm: 1.3, meanOverallDiaMm: 23.0, insulationResistanceAt20CMOhmKm: 249, insulationResistanceAt90CMOhmKm: 0.249 },
  { csaSqMm: 150, insulationThicknessMm: 1.4, sheathThicknessMm: 1.4, meanOverallDiaMm: 25.7, insulationResistanceAt20CMOhmKm: 260, insulationResistanceAt90CMOhmKm: 0.26 },
  { csaSqMm: 185, insulationThicknessMm: 1.6, sheathThicknessMm: 1.6, meanOverallDiaMm: 28.7, insulationResistanceAt20CMOhmKm: 268, insulationResistanceAt90CMOhmKm: 0.268 },
  { csaSqMm: 240, insulationThicknessMm: 1.7, sheathThicknessMm: 1.7, meanOverallDiaMm: 32.3, insulationResistanceAt20CMOhmKm: 249, insulationResistanceAt90CMOhmKm: 0.249 },
  { csaSqMm: 300, insulationThicknessMm: 1.8, sheathThicknessMm: 1.8, meanOverallDiaMm: 35.6, insulationResistanceAt20CMOhmKm: 237, insulationResistanceAt90CMOhmKm: 0.237 },
  { csaSqMm: 400, insulationThicknessMm: 2.0, sheathThicknessMm: 2.0, meanOverallDiaMm: 40.6, insulationResistanceAt20CMOhmKm: 230, insulationResistanceAt90CMOhmKm: 0.23 },
];

/** TABLE 2 — Class 2 conductors (Clauses 6.3, 7). Fixed installation. Starts at 16 sq mm. */
export const IS17293_TABLE2_CLASS2: ReadonlyArray<SolarDimensionRow> = [
  { csaSqMm: 16, insulationThicknessMm: 0.7, sheathThicknessMm: 0.9, meanOverallDiaMm: 9.5, insulationResistanceAt20CMOhmKm: 374, insulationResistanceAt90CMOhmKm: 0.374 },
  { csaSqMm: 25, insulationThicknessMm: 0.9, sheathThicknessMm: 1.0, meanOverallDiaMm: 11.8, insulationResistanceAt20CMOhmKm: 384, insulationResistanceAt90CMOhmKm: 0.384 },
  { csaSqMm: 35, insulationThicknessMm: 0.9, sheathThicknessMm: 1.1, meanOverallDiaMm: 13.2, insulationResistanceAt20CMOhmKm: 327, insulationResistanceAt90CMOhmKm: 0.327 },
  { csaSqMm: 50, insulationThicknessMm: 1.0, sheathThicknessMm: 1.2, meanOverallDiaMm: 15.1, insulationResistanceAt20CMOhmKm: 317, insulationResistanceAt90CMOhmKm: 0.317 },
  { csaSqMm: 70, insulationThicknessMm: 1.1, sheathThicknessMm: 1.2, meanOverallDiaMm: 17.3, insulationResistanceAt20CMOhmKm: 291, insulationResistanceAt90CMOhmKm: 0.291 },
  { csaSqMm: 95, insulationThicknessMm: 1.1, sheathThicknessMm: 1.3, meanOverallDiaMm: 19.6, insulationResistanceAt20CMOhmKm: 251, insulationResistanceAt90CMOhmKm: 0.251 },
  { csaSqMm: 120, insulationThicknessMm: 1.2, sheathThicknessMm: 1.3, meanOverallDiaMm: 21.6, insulationResistanceAt20CMOhmKm: 244, insulationResistanceAt90CMOhmKm: 0.244 },
  { csaSqMm: 150, insulationThicknessMm: 1.4, sheathThicknessMm: 1.4, meanOverallDiaMm: 24.0, insulationResistanceAt20CMOhmKm: 254, insulationResistanceAt90CMOhmKm: 0.254 },
  { csaSqMm: 185, insulationThicknessMm: 1.6, sheathThicknessMm: 1.6, meanOverallDiaMm: 27.0, insulationResistanceAt20CMOhmKm: 261, insulationResistanceAt90CMOhmKm: 0.261 },
  { csaSqMm: 240, insulationThicknessMm: 1.7, sheathThicknessMm: 1.7, meanOverallDiaMm: 30.4, insulationResistanceAt20CMOhmKm: 243, insulationResistanceAt90CMOhmKm: 0.243 },
  { csaSqMm: 300, insulationThicknessMm: 1.8, sheathThicknessMm: 1.8, meanOverallDiaMm: 33.5, insulationResistanceAt20CMOhmKm: 231, insulationResistanceAt90CMOhmKm: 0.231 },
  { csaSqMm: 400, insulationThicknessMm: 2.0, sheathThicknessMm: 2.0, meanOverallDiaMm: 37.7, insulationResistanceAt20CMOhmKm: 227, insulationResistanceAt90CMOhmKm: 0.227 },
];

/** Look up the dimensional row for a size and class. Throws rather than defaulting. */
export function solarDimensions(csaSqMm: number, klass: SolarConductorClass): {
  values: SolarDimensionRow;
  ref: string;
} {
  const table = klass === "Class 5" ? IS17293_TABLE1_CLASS5 : IS17293_TABLE2_CLASS2;
  const tableName = klass === "Class 5" ? "Table 1" : "Table 2";
  const row = table.find((r) => r.csaSqMm === csaSqMm);
  if (!row) throw new StandardsLookupError("IS17293", `${tableName} (${klass})`, "csaSqMm", csaSqMm);
  return { values: row, ref: `IS 17293 : 2020, ${tableName} (${csaSqMm} sq mm, ${klass})` };
}

/**
 * §5.3 — insulation thickness tolerance. BIS additive form, same shape as IS 7098-1 §10.3.
 * NOTE this is NOT the IEC 62930 rule (0.9·t − 0.1); see the header note.
 */
export function insulationToleranceFloorMm(nominalTiMm: number): number {
  return nominalTiMm - (0.1 + 0.1 * nominalTiMm);
}

/**
 * §6.3 — sheath thickness tolerance. Note the coefficient is 0.15, NOT the 0.1 used for
 * insulation: the sheath is allowed a wider negative tolerance than the insulation is.
 */
export function sheathToleranceFloorMm(nominalTsMm: number): number {
  return nominalTsMm - (0.1 + 0.15 * nominalTsMm);
}

/** §11.3.3 — ovality limit on the finished cable. */
export const IS17293_MAX_OVALITY_PERCENT = 15;

/** §6.4 — sheath colour, and the polarity marking that may accompany it. */
export const IS17293_SHEATH = {
  preferredColour: "Black",
  alternativeColourAllowed: "Any other colour as agreed between manufacturer and customer",
  polaritySymbols: ["+", "-"] as const,
  polarityNote: "Polarity symbol is marked on the SAME base colour of sheath",
  adhesionRule: "The sheath shall not adhere to the core; a separator or talcum powder may be used",
  ref: "IS 17293 : 2020, §6.2 and §6.4",
} as const;

/** §9 — core identification. Solar cable is single-core, so this is a colour, not a scheme. */
export const IS17293_CORE_COLOUR = {
  preferred: ["red", "black"],
  alternativeAllowed: "Any other colour scheme agreed between purchaser and manufacturer",
  stripesAllowed: true,
  stripeRule: "For every 15 mm of core, one colour covers approximately but not exceeding 70 percent",
  ref: "IS 17293 : 2020, §9",
} as const;

/**
 * §8 — cable identification. THREE mandatory marks, all of which must appear.
 * 'PV' is the IS designation where EN 50618 uses 'H1Z2Z2-K'.
 */
export const IS17293_MARKING = {
  codeDesignation: "PV",
  mandatoryLegend: "HALOGEN FREE LOW SMOKE",
  crossSectionExample: "1.5 sqmm",
  originRequired: "Manufacturer's name or trade-mark",
  maxGapBetweenMarksMm: 550,
  method: "Printing, indentation or embossing on the sheath",
  ref: "IS 17293 : 2020, §8",
} as const;

/** §12.2 — what must be stencilled on the drum. 'ATC' = annealed tinned copper. */
export const IS17293_DRUM_MARKING_ITEMS = [
  "Reference to IS 17293",
  "Manufacturer's name, brand name or trade-mark",
  "Voltage grade",
  "Code designation 'PV'",
  "Number of cores",
  "Nominal cross-sectional area of conductor",
  "Word 'ATC'",
  "Colour of sheath",
  "Length of cable on the reel, drum or coil",
  "Number of lengths (if more than one)",
  "Direction of rotation of drum (arrow), if wooden drum",
  "Country of manufacture",
  "Year of manufacture",
] as const;

/**
 * TABLE 7 — Current carrying capacity, at 40 °C ambient and 90 °C conductor.
 *
 * Three installation methods, and they differ substantially: two loaded cables touching on a
 * surface carry roughly 75 % of what a single cable free in air does. Not interchangeable.
 */
export interface SolarCurrentRow {
  csaSqMm: number;
  singleFreeInAirA: number;
  singleOnSurfaceA: number;
  twoTouchingOnSurfaceA: number;
}

export const IS17293_TABLE7_CURRENT: ReadonlyArray<SolarCurrentRow> = [
  { csaSqMm: 1.5, singleFreeInAirA: 28, singleOnSurfaceA: 27, twoTouchingOnSurfaceA: 22 },
  { csaSqMm: 2.5, singleFreeInAirA: 38, singleOnSurfaceA: 36, twoTouchingOnSurfaceA: 30 },
  { csaSqMm: 4, singleFreeInAirA: 52, singleOnSurfaceA: 49, twoTouchingOnSurfaceA: 41 },
  { csaSqMm: 6, singleFreeInAirA: 66, singleOnSurfaceA: 63, twoTouchingOnSurfaceA: 53 },
  { csaSqMm: 10, singleFreeInAirA: 89, singleOnSurfaceA: 87, twoTouchingOnSurfaceA: 73 },
  { csaSqMm: 16, singleFreeInAirA: 120, singleOnSurfaceA: 118, twoTouchingOnSurfaceA: 97 },
  { csaSqMm: 25, singleFreeInAirA: 167, singleOnSurfaceA: 158, twoTouchingOnSurfaceA: 126 },
  { csaSqMm: 35, singleFreeInAirA: 207, singleOnSurfaceA: 196, twoTouchingOnSurfaceA: 156 },
  { csaSqMm: 50, singleFreeInAirA: 261, singleOnSurfaceA: 248, twoTouchingOnSurfaceA: 190 },
  { csaSqMm: 70, singleFreeInAirA: 329, singleOnSurfaceA: 313, twoTouchingOnSurfaceA: 245 },
  { csaSqMm: 95, singleFreeInAirA: 394, singleOnSurfaceA: 374, twoTouchingOnSurfaceA: 298 },
  { csaSqMm: 120, singleFreeInAirA: 462, singleOnSurfaceA: 440, twoTouchingOnSurfaceA: 348 },
  { csaSqMm: 150, singleFreeInAirA: 537, singleOnSurfaceA: 510, twoTouchingOnSurfaceA: 401 },
  { csaSqMm: 185, singleFreeInAirA: 611, singleOnSurfaceA: 581, twoTouchingOnSurfaceA: 460 },
  { csaSqMm: 240, singleFreeInAirA: 735, singleOnSurfaceA: 698, twoTouchingOnSurfaceA: 545 },
  { csaSqMm: 300, singleFreeInAirA: 831, singleOnSurfaceA: 788, twoTouchingOnSurfaceA: 631 },
  { csaSqMm: 400, singleFreeInAirA: 999, singleOnSurfaceA: 947, twoTouchingOnSurfaceA: 751 },
];

export type SolarInstallationMethod = "free-in-air" | "on-surface" | "two-touching";

/** TABLE 8 — current rating conversion factors for ambient temperatures other than 40 °C. */
export const IS17293_TABLE8_TEMP_FACTORS: Readonly<Record<number, number>> = {
  0: 1.34, 10: 1.26, 20: 1.19, 30: 1.1, 40: 1.0, 50: 0.9, 60: 0.78, 70: 0.64,
};

export const IS17293_CURRENT_BASE_AMBIENT_C = 40;

/**
 * Current-carrying capacity, corrected for ambient temperature.
 *
 * The Table 7 figures assume 40 °C ambient. India routinely exceeds that on a PV array, and at
 * 60 °C the factor is 0.78 — a 22 % de-rate. Getting this wrong undersizes the cable, so the
 * ambient is a required argument rather than an optional one with a comfortable default.
 */
export function currentCarryingCapacityA(args: {
  csaSqMm: number;
  method: SolarInstallationMethod;
  ambientC: number;
}): { amps: number; baseAmps: number; factor: number; ref: string } {
  const row = IS17293_TABLE7_CURRENT.find((r) => r.csaSqMm === args.csaSqMm);
  if (!row) throw new StandardsLookupError("IS17293", "Table 7", "csaSqMm", args.csaSqMm);

  const factor = IS17293_TABLE8_TEMP_FACTORS[args.ambientC];
  if (factor === undefined) {
    throw new StandardsLookupError("IS17293", "Table 8", "ambientC", args.ambientC);
  }

  const baseAmps =
    args.method === "free-in-air" ? row.singleFreeInAirA
    : args.method === "on-surface" ? row.singleOnSurfaceA
    : row.twoTouchingOnSurfaceA;

  return {
    amps: Math.round(baseAmps * factor * 10) / 10,
    baseAmps,
    factor,
    ref: `IS 17293 : 2020, Table 7 (${args.csaSqMm} sq mm, ${args.method}) × Table 8 (${args.ambientC} °C)`,
  };
}

/** TABLE 6 — minimum bending radii, as a multiple of overall diameter D. */
export interface BendingRadiusRow {
  maxDiaMm: number | null;
  fixedNormal: number;
  fixedAtTermination: number;
  flexibleFixed: number;
  flexibleFreeMovement: number;
}

export const IS17293_TABLE6_BENDING: ReadonlyArray<BendingRadiusRow> = [
  { maxDiaMm: 8, fixedNormal: 4, fixedAtTermination: 2, flexibleFixed: 3, flexibleFreeMovement: 4 },
  { maxDiaMm: 12, fixedNormal: 5, fixedAtTermination: 3, flexibleFixed: 3, flexibleFreeMovement: 4 },
  { maxDiaMm: 20, fixedNormal: 6, fixedAtTermination: 4, flexibleFixed: 4, flexibleFreeMovement: 5 },
  { maxDiaMm: null, fixedNormal: 6, fixedAtTermination: 4, flexibleFixed: 4, flexibleFreeMovement: 6 },
];

/** Minimum bending radius in mm, for a finished cable of a given overall diameter. */
export function minimumBendingRadiusMm(args: {
  overallDiaMm: number;
  use: "fixed-normal" | "fixed-termination" | "flexible-fixed" | "flexible-moving";
}): { radiusMm: number; multiple: number; ref: string } {
  const band = IS17293_TABLE6_BENDING.find((b) => b.maxDiaMm === null || args.overallDiaMm <= b.maxDiaMm);
  if (!band) throw new StandardsLookupError("IS17293", "Table 6", "overallDiaMm", args.overallDiaMm);
  const multiple =
    args.use === "fixed-normal" ? band.fixedNormal
    : args.use === "fixed-termination" ? band.fixedAtTermination
    : args.use === "flexible-fixed" ? band.flexibleFixed
    : band.flexibleFreeMovement;
  return {
    radiusMm: Math.round(multiple * args.overallDiaMm * 10) / 10,
    multiple,
    ref: `IS 17293 : 2020, Table 6 (${args.use})`,
  };
}

/** Annex A-1 — handling and storage limits that belong on a GTP. */
export const IS17293_HANDLING = {
  maxStorageTempC: 45,
  minInstallationTempC: 25,
  directBurialPermitted: false,
  ref: "IS 17293 : 2020, Table 5",
} as const;

/** §11.2.1 — voltage test on the completed cable. */
export const IS17293_VOLTAGE_TEST = {
  acKv: 6.5,
  dcKv: 15,
  durationMin: 5,
  immersionHours: 1,
  ref: "IS 17293 : 2020, §11.2.1",
} as const;

/** Offerable sizes, per class. Class 2 starts at 16 sq mm — there is no smaller fixed-install row. */
export const IS17293_CLASS5_SIZES: number[] = IS17293_TABLE1_CLASS5.map((r) => r.csaSqMm);
export const IS17293_CLASS2_SIZES: number[] = IS17293_TABLE2_CLASS2.map((r) => r.csaSqMm);
