/**
 * Daksha / Navya works catalogue — the manufacturer's own published cable tables.
 *
 * ─── Why a catalogue module exists at all ─────────────────────────────────────────────────────
 *
 * Client instruction, 22 Sept 2026: "All technical specs should be read from existing catalog
 * charts, not entered manually each time... the GTP tool should parse the relevant row
 * automatically based on the selected cable type and size."
 *
 * It also answers three questions the standards genuinely cannot:
 *
 *   1. OVERALL DIAMETER. IS 10462 §0.4 says in terms that the fictitious method "is not a
 *      replacement for the calculation of normal diameters required for practical purposes,
 *      which should be calculated separately". The catalogue IS that separate calculation —
 *      it is what the works actually makes and measures. A customer will not accept a spec
 *      without this figure, and until now we had no source for it.
 *
 *   2. SECTOR-SHAPED COMPACTED CONDUCTORS. Raised 21 Sept. The fictitious chain ignores shape
 *      by design, so it cannot express the tighter packing of a sector core. These diameters
 *      already account for it, because they describe real cable.
 *
 *   3. MASS, for control cable. The chain derives mass from fictitious diameters; the catalogue
 *      publishes measured kg/km. Where both exist the catalogue wins.
 *
 * ─── What it is NOT ───────────────────────────────────────────────────────────────────────────
 *
 * Not a standard. These are works figures — `works-data`, never `is-table`. Where the catalogue
 * and a standard disagree, that is a fact to surface to a human, not to resolve silently: see
 * `CATALOGUE_DIVERGENCES`.
 *
 * ─── Source ───────────────────────────────────────────────────────────────────────────────────
 *
 * "Daksha Cable Brochure2.pdf", Daksha Cable Industries Pvt Ltd, 143-A Government Industrial
 * Estate, Charkop, Kandivali (West), Mumbai 400067. Transcribed from the PDF's own text layer
 * (not OCR), page 4 (control) and page 6 (LT XLPE 3½ core).
 *
 * Encoding status: DRAFT. Rows are transcribed and structurally validated, and cross-checked
 * against IS 7098-1 and IS 1554-1 by the tests beside this file — but per the encoding SOP a
 * human must confirm each row against the rendered page before this is marked verified.
 *
 * ─── A note on the brochure's own numbering ───────────────────────────────────────────────────
 *
 * The brochure has TWO tables numbered 7 (control 2.5 sq mm on page 4, and LT XLPE aluminium on
 * page 6). Referenced here by page and title rather than by number, so a citation on a GTP
 * points somewhere unambiguous.
 */

export type CatalogueArmour = "unarmoured" | "strip" | "round-wire";

export interface CatalogueSource {
  document: string;
  page: number;
  table: string;
}

/** Every dimension the catalogue publishes for one cable, in mm unless stated. */
export interface CatalogueRow {
  /** Main conductor nominal area, sq mm. */
  csaSqMm: number;
  /** Reduced neutral area, sq mm — 3½ core only. */
  neutralSqMm?: number;
  /** Cores, counting the reduced neutral as the half. */
  coreCount: number;
  insulationThicknessMm: number;
  /** The reduced neutral carries its own, thinner wall. */
  neutralInsulationThicknessMm?: number;
  innerSheathThicknessMm: number;
  unarmoured: { outerSheathThicknessMm: number; overallDiaMm: number; massKgPerKm?: number };
  /** Absent where the catalogue prints "-": strip is not offered at that size. */
  strip?: {
    stripSize: string;
    outerSheathThicknessMm: number;
    overallDiaMm: number;
    massKgPerKm?: number;
  };
  roundWire?: {
    wireDiaMm: number;
    outerSheathThicknessMm: number;
    overallDiaMm: number;
    massKgPerKm?: number;
  };
  /** Current rating, amps. Keys differ by family — see each table's note. */
  currentRatingA?: Record<string, number>;
  maxDcResistanceOhmPerKm?: number;
  acResistanceAt90COhmPerKm?: number;
}

export interface CatalogueTable {
  id: string;
  title: string;
  source: CatalogueSource;
  family: "XLPE_POWER" | "PVC_CONTROL";
  material: "AL" | "CU";
  /** Fixed for control tables (every row is one size); undefined for the power tables. */
  fixedCsaSqMm?: number;
  rows: CatalogueRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// LT XLPE, three-and-a-half core
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip armour is 4 × 0.80 mm at EVERY size, 25/16 through 500/240.
 *
 * Worth stating because it settles a question raised twice. IS 7098-1 Table 6 prints two
 * accepted practices: (a) a flat 0.8 mm formed wire above 13 mm, and (b) a banded table stepping
 * to 1.4 mm past 40 mm. The works uses (a) throughout — which is exactly what the client said
 * on 21 Sept ("Galvanised Steel Strip Armour size 4 X 0.8mm ... which is very widely used").
 * Their own catalogue is the evidence.
 *
 * NOTE: these tables publish no kg/km. Diameters yes, mass no — so LT XLPE mass still comes from
 * the derived chain, and only the diameter is superseded. The control tables (below) do publish
 * mass, and there the catalogue wins outright.
 */
const LT_XLPE_35_CORE_DIMENSIONS = [
  // csa/neutral, insulMain, insulNeutral, inner, unarm sheath, unarm dia, strip sheath, strip dia, wire dia, wire sheath, wire dia over
  { csaSqMm: 25, neutralSqMm: 16, ins: 0.9, nIns: 0.7, inner: 0.3, uSh: 2.0, uDia: 21.0, sSh: 1.4, sDia: 22.0, wDia: 1.6, wSh: 1.4, wOver: 24.0 },
  { csaSqMm: 35, neutralSqMm: 16, ins: 0.9, nIns: 0.7, inner: 0.3, uSh: 2.0, uDia: 23.0, sSh: 1.4, sDia: 24.0, wDia: 1.6, wSh: 1.4, wOver: 26.0 },
  { csaSqMm: 50, neutralSqMm: 16, ins: 1.0, nIns: 0.9, inner: 0.3, uSh: 2.0, uDia: 26.0, sSh: 1.4, sDia: 27.0, wDia: 1.6, wSh: 1.56, wOver: 29.0 },
  { csaSqMm: 70, neutralSqMm: 35, ins: 1.1, nIns: 0.9, inner: 0.4, uSh: 2.2, uDia: 30.0, sSh: 1.56, sDia: 31.0, wDia: 2.0, wSh: 1.56, wOver: 34.0 },
  { csaSqMm: 95, neutralSqMm: 50, ins: 1.1, nIns: 1.0, inner: 0.4, uSh: 2.2, uDia: 34.0, sSh: 1.56, sDia: 35.0, wDia: 2.0, wSh: 1.56, wOver: 38.0 },
  { csaSqMm: 120, neutralSqMm: 70, ins: 1.2, nIns: 1.1, inner: 0.4, uSh: 2.2, uDia: 37.0, sSh: 1.72, sDia: 38.0, wDia: 2.0, wSh: 1.72, wOver: 41.0 },
  { csaSqMm: 150, neutralSqMm: 70, ins: 1.4, nIns: 1.1, inner: 0.5, uSh: 2.4, uDia: 41.0, sSh: 1.72, sDia: 42.0, wDia: 2.0, wSh: 1.88, wOver: 45.0 },
  { csaSqMm: 185, neutralSqMm: 95, ins: 1.6, nIns: 1.1, inner: 0.5, uSh: 2.6, uDia: 47.0, sSh: 1.88, sDia: 47.0, wDia: 2.5, wSh: 2.04, wOver: 50.0 },
  { csaSqMm: 240, neutralSqMm: 120, ins: 1.7, nIns: 1.2, inner: 0.6, uSh: 2.8, uDia: 51.5, sSh: 2.04, sDia: 52.0, wDia: 2.5, wSh: 2.2, wOver: 56.0 },
  { csaSqMm: 300, neutralSqMm: 150, ins: 1.8, nIns: 1.4, inner: 0.6, uSh: 3.0, uDia: 56.0, sSh: 2.2, sDia: 56.0, wDia: 2.5, wSh: 2.36, wOver: 61.0 },
  { csaSqMm: 400, neutralSqMm: 185, ins: 2.0, nIns: 1.6, inner: 0.7, uSh: 3.4, uDia: 63.0, sSh: 2.52, sDia: 63.0, wDia: 3.15, wSh: 2.68, wOver: 69.0 },
  { csaSqMm: 500, neutralSqMm: 240, ins: 2.2, nIns: 1.7, inner: 0.7, uSh: 3.6, uDia: 71.0, sSh: 2.68, sDia: 71.5, wDia: 3.15, wSh: 2.84, wOver: 77.0 },
] as const;

/** Aluminium ratings and resistances. Dimensions are shared with the copper table. */
const LT_XLPE_35_AL_ELECTRICAL: Record<number, { inGroundA: number; inAirA: number; dc20: number; ac90: number }> = {
  25: { inGroundA: 95, inAirA: 93, dc20: 1.2, ac90: 1.54 },
  35: { inGroundA: 114, inAirA: 114, dc20: 0.868, ac90: 1.11 },
  50: { inGroundA: 134, inAirA: 138, dc20: 0.641, ac90: 0.82 },
  70: { inGroundA: 164, inAirA: 175, dc20: 0.443, ac90: 0.567 },
  95: { inGroundA: 197, inAirA: 216, dc20: 0.32, ac90: 0.41 },
  120: { inGroundA: 223, inAirA: 249, dc20: 0.253, ac90: 0.324 },
  150: { inGroundA: 249, inAirA: 284, dc20: 0.206, ac90: 0.264 },
  185: { inGroundA: 282, inAirA: 329, dc20: 0.164, ac90: 0.21 },
  240: { inGroundA: 327, inAirA: 392, dc20: 0.125, ac90: 0.16 },
  300: { inGroundA: 369, inAirA: 452, dc20: 0.1, ac90: 0.128 },
  400: { inGroundA: 420, inAirA: 526, dc20: 0.0778, ac90: 0.1 },
  500: { inGroundA: 478, inAirA: 612, dc20: 0.0605, ac90: 0.0774 },
};

/** Copper ratings and resistances. The copper table stops at 400/185 — there is no 500 row. */
const LT_XLPE_35_CU_ELECTRICAL: Record<number, { inGroundA: number; inAirA: number; dc20: number; ac90: number }> = {
  25: { inGroundA: 122, inAirA: 119, dc20: 0.727, ac90: 0.93 },
  35: { inGroundA: 146, inAirA: 147, dc20: 0.524, ac90: 0.671 },
  50: { inGroundA: 173, inAirA: 179, dc20: 0.387, ac90: 0.495 },
  70: { inGroundA: 212, inAirA: 226, dc20: 0.268, ac90: 0.343 },
  95: { inGroundA: 254, inAirA: 279, dc20: 0.193, ac90: 0.247 },
  120: { inGroundA: 287, inAirA: 320, dc20: 0.153, ac90: 0.196 },
  150: { inGroundA: 321, inAirA: 365, dc20: 0.124, ac90: 0.159 },
  185: { inGroundA: 362, inAirA: 422, dc20: 0.0991, ac90: 0.127 },
  240: { inGroundA: 418, inAirA: 500, dc20: 0.0754, ac90: 0.0965 },
  300: { inGroundA: 469, inAirA: 574, dc20: 0.0601, ac90: 0.0769 },
  400: { inGroundA: 528, inAirA: 662, dc20: 0.047, ac90: 0.0602 },
};

function ltXlpeRows(material: "AL" | "CU"): CatalogueRow[] {
  const electrical = material === "AL" ? LT_XLPE_35_AL_ELECTRICAL : LT_XLPE_35_CU_ELECTRICAL;
  return LT_XLPE_35_CORE_DIMENSIONS.filter((d) => electrical[d.csaSqMm] !== undefined).map((d) => {
    const e = electrical[d.csaSqMm];
    return {
      csaSqMm: d.csaSqMm,
      neutralSqMm: d.neutralSqMm,
      coreCount: 3.5,
      insulationThicknessMm: d.ins,
      neutralInsulationThicknessMm: d.nIns,
      innerSheathThicknessMm: d.inner,
      unarmoured: { outerSheathThicknessMm: d.uSh, overallDiaMm: d.uDia },
      strip: { stripSize: "4 × 0.80 mm", outerSheathThicknessMm: d.sSh, overallDiaMm: d.sDia },
      roundWire: { wireDiaMm: d.wDia, outerSheathThicknessMm: d.wSh, overallDiaMm: d.wOver },
      currentRatingA: { inGround: e.inGroundA, inFreeAir: e.inAirA },
      maxDcResistanceOhmPerKm: e.dc20,
      acResistanceAt90COhmPerKm: e.ac90,
    };
  });
}

export const DAKSHA_LT_XLPE_35_ALUMINIUM: CatalogueTable = {
  id: "daksha-lt-xlpe-3.5c-al",
  title: '"DAKSHACABLE" 1100V three and a half core aluminium conductor, XLPE insulated, unarmoured & armoured',
  source: { document: "Daksha Cable Brochure2.pdf", page: 6, table: "Table 7 (DAKSHACABLE)" },
  family: "XLPE_POWER",
  material: "AL",
  rows: ltXlpeRows("AL"),
};

export const DAKSHA_LT_XLPE_35_COPPER: CatalogueTable = {
  id: "daksha-lt-xlpe-3.5c-cu",
  title: '"RALLISON" 1100V three and a half core copper conductor, XLPE insulated, unarmoured & armoured',
  source: { document: "Daksha Cable Brochure2.pdf", page: 6, table: "Table 8 (RALLISON)" },
  family: "XLPE_POWER",
  material: "CU",
  rows: ltXlpeRows("CU"),
};

// ─────────────────────────────────────────────────────────────────────────────
// Control cable
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Control rows. Unlike the power tables these publish kg/km, so the catalogue supersedes the
 * derived mass outright here.
 *
 * Strip armour is absent ("-") on the low core counts and appears from 12 core at 1.5 sq mm and
 * 9 core at 2.5 sq mm. That is IS 1554-1 §13.2 showing up in the works' own practice: below
 * roughly 13 mm under the armour the standard permits round wire only, and these are the sizes
 * where the cable is too thin for strip.
 *
 * Columns: cores, insul, inner, [unarmoured: sheath, dia, kg/km], [strip: sheath, dia, kg/km],
 * [round wire: dia, sheath, dia over, kg/km].
 */
const CONTROL_1_5: ReadonlyArray<readonly [number, number, number, number, number, number, number | null, number | null, number | null, number, number, number, number]> = [
  [2, 0.8, 0.3, 1.8, 11.0, 155, null, null, null, 1.4, 1.24, 12.5, 340],
  [3, 0.8, 0.3, 1.8, 11.5, 195, null, null, null, 1.4, 1.24, 13.0, 395],
  [4, 0.8, 0.3, 1.8, 12.0, 235, null, null, null, 1.4, 1.24, 14.0, 455],
  [5, 0.8, 0.3, 1.8, 13.0, 275, null, null, null, 1.4, 1.24, 15.0, 515],
  [6, 0.8, 0.3, 1.8, 14.0, 305, null, null, null, 1.4, 1.24, 16.0, 575],
  [7, 0.8, 0.3, 1.8, 14.0, 315, null, null, null, 1.4, 1.24, 16.0, 580],
  [8, 0.8, 0.3, 1.8, 15.0, 370, null, null, null, 1.4, 1.24, 17.0, 660],
  [9, 0.8, 0.3, 1.8, 16.5, 415, null, null, null, 1.4, 1.24, 18.0, 730],
  [10, 0.8, 0.3, 1.8, 17.5, 425, null, null, null, 1.4, 1.4, 19.5, 775],
  [12, 0.8, 0.3, 1.8, 18.0, 480, 1.24, 18.5, 680, 1.6, 1.4, 20.5, 890],
  [14, 0.8, 0.3, 1.8, 19.0, 540, 1.4, 19.5, 775, 1.6, 1.4, 21.5, 980],
  [16, 0.8, 0.3, 1.8, 20.0, 600, 1.4, 20.5, 860, 1.6, 1.4, 22.5, 1060],
  [19, 0.8, 0.3, 2.0, 21.5, 695, 1.4, 22.0, 935, 1.6, 1.4, 23.5, 1165],
  [21, 0.8, 0.3, 2.0, 22.5, 775, 1.4, 23.0, 1035, 1.6, 1.4, 24.5, 1280],
  [24, 0.8, 0.3, 2.0, 24.5, 860, 1.4, 25.0, 1155, 1.6, 1.4, 26.5, 1420],
  [27, 0.8, 0.3, 2.0, 25.0, 935, 1.4, 25.5, 1230, 1.6, 1.4, 27.0, 1495],
  [30, 0.8, 0.3, 2.0, 26.0, 1020, 1.4, 26.5, 1315, 1.6, 1.4, 28.0, 1610],
  [32, 0.8, 0.3, 2.0, 27.0, 1085, 1.4, 27.5, 1400, 1.6, 1.4, 29.0, 1690],
  [34, 0.8, 0.3, 2.0, 28.0, 1145, 1.4, 28.5, 1480, 1.6, 1.4, 30.0, 1780],
  [37, 0.8, 0.3, 2.0, 28.0, 1210, 1.4, 28.5, 1545, 1.6, 1.4, 30.0, 1845],
] as const;

const CONTROL_2_5: ReadonlyArray<readonly [number, number, number, number, number, number, number | null, number | null, number | null, number, number, number, number]> = [
  [2, 0.9, 0.3, 1.8, 12.0, 195, null, null, null, 1.4, 1.24, 13.5, 415],
  [3, 0.9, 0.3, 1.8, 12.5, 255, null, null, null, 1.4, 1.24, 14.5, 485],
  [4, 0.9, 0.3, 1.8, 13.5, 305, null, null, null, 1.4, 1.24, 15.5, 560],
  [5, 0.9, 0.3, 1.8, 15.0, 365, null, null, null, 1.4, 1.24, 16.5, 640],
  [6, 0.9, 0.3, 1.8, 16.0, 410, null, null, null, 1.4, 1.24, 17.5, 710],
  [7, 0.9, 0.3, 1.8, 16.0, 425, null, null, null, 1.4, 1.24, 17.5, 725],
  [8, 0.9, 0.3, 1.8, 17.5, 500, null, null, null, 1.4, 1.4, 19.5, 840],
  [9, 0.9, 0.3, 1.8, 18.5, 570, 1.4, 19.5, 805, 1.6, 1.4, 21.0, 1000],
  [10, 0.9, 0.3, 1.8, 20.0, 580, 1.4, 21.0, 840, 1.6, 1.4, 22.5, 1040],
  [12, 0.9, 0.3, 2.0, 21.0, 680, 1.4, 21.5, 915, 1.6, 1.4, 23.0, 1150],
  [14, 0.9, 0.3, 2.0, 22.0, 770, 1.4, 22.5, 1025, 1.6, 1.4, 24.0, 1255],
  [16, 0.9, 0.3, 2.0, 23.0, 860, 1.4, 23.5, 1140, 1.6, 1.4, 25.0, 1380],
  [19, 0.9, 0.3, 2.0, 24.5, 975, 1.4, 25.0, 1250, 1.6, 1.4, 26.5, 1520],
  [21, 0.9, 0.3, 2.0, 25.5, 1090, 1.4, 26.0, 1385, 1.6, 1.4, 27.5, 1670],
  [24, 0.9, 0.3, 2.0, 28.5, 1205, 1.4, 29.0, 1540, 1.6, 1.56, 31.0, 1885],
  [27, 0.9, 0.3, 2.0, 29.0, 1325, 1.4, 29.5, 1655, 1.6, 1.56, 31.5, 2015],
  [30, 0.9, 0.3, 2.0, 30.0, 1450, 1.56, 31.0, 1825, 1.6, 1.56, 32.5, 2155],
  [32, 0.9, 0.3, 2.0, 31.5, 1545, 1.56, 32.0, 1945, 1.6, 1.56, 33.5, 2280],
  [34, 0.9, 0.4, 2.2, 33.0, 1685, 1.56, 33.5, 2065, 2.0, 1.56, 36.0, 2640],
  [37, 0.9, 0.4, 2.2, 33.0, 1785, 1.56, 33.5, 2165, 2.0, 1.56, 36.0, 2740],
] as const;

function controlRows(
  raw: typeof CONTROL_1_5,
  csaSqMm: number,
): CatalogueRow[] {
  return raw.map(([cores, ins, inner, uSh, uDia, uKg, sSh, sDia, sKg, wDia, wSh, wOver, wKg]) => ({
    csaSqMm,
    coreCount: cores,
    insulationThicknessMm: ins,
    innerSheathThicknessMm: inner,
    unarmoured: { outerSheathThicknessMm: uSh, overallDiaMm: uDia, massKgPerKm: uKg },
    // Absent where the brochure prints "-": strip is not offered at that diameter.
    strip:
      sSh === null || sDia === null || sKg === null
        ? undefined
        : { stripSize: "4.0 × 0.8 mm", outerSheathThicknessMm: sSh, overallDiaMm: sDia, massKgPerKm: sKg },
    roundWire: { wireDiaMm: wDia, outerSheathThicknessMm: wSh, overallDiaMm: wOver, massKgPerKm: wKg },
  }));
}

export const DAKSHA_CONTROL_1_5: CatalogueTable = {
  id: "daksha-control-1.5",
  title: "1100 V, 1.5 sq mm multi-core control cable, copper conductor, PVC type A/C insulated",
  source: { document: "Daksha Cable Brochure2.pdf", page: 4, table: "Table 6 (control 1.5 sq mm)" },
  family: "PVC_CONTROL",
  material: "CU",
  fixedCsaSqMm: 1.5,
  rows: controlRows(CONTROL_1_5, 1.5),
};

export const DAKSHA_CONTROL_2_5: CatalogueTable = {
  id: "daksha-control-2.5",
  title: "1100 V, 2.5 sq mm multi-core control cable, copper conductor, PVC type A/C insulated",
  source: { document: "Daksha Cable Brochure2.pdf", page: 4, table: "Table 7 (control 2.5 sq mm)" },
  family: "PVC_CONTROL",
  material: "CU",
  fixedCsaSqMm: 2.5,
  rows: controlRows(CONTROL_2_5, 2.5),
};

export const DAKSHA_CATALOGUE: readonly CatalogueTable[] = [
  DAKSHA_LT_XLPE_35_ALUMINIUM,
  DAKSHA_LT_XLPE_35_COPPER,
  DAKSHA_CONTROL_1_5,
  DAKSHA_CONTROL_2_5,
];

// ─────────────────────────────────────────────────────────────────────────────
// Lookup
// ─────────────────────────────────────────────────────────────────────────────

export interface CatalogueQuery {
  family: "XLPE_POWER" | "PVC_CONTROL";
  material: "AL" | "CU";
  csaSqMm: number;
  coreCount: number;
}

export interface CatalogueHit {
  row: CatalogueRow;
  table: CatalogueTable;
  /** Citation for the GTP's trace column. */
  ref: string;
}

/**
 * The catalogue row for a cable, or null when the works does not publish one.
 *
 * Null is a normal answer, not a failure: the brochure covers 3½ core XLPE and 1.5/2.5 sq mm
 * control, which is most of what the factory sells but far from every cable the engine can
 * derive. Callers fall back to the derived chain and say which they used.
 */
export function findCatalogueRow(query: CatalogueQuery): CatalogueHit | null {
  for (const table of DAKSHA_CATALOGUE) {
    if (table.family !== query.family || table.material !== query.material) continue;
    if (table.fixedCsaSqMm !== undefined && table.fixedCsaSqMm !== query.csaSqMm) continue;
    const row = table.rows.find(
      (r) => r.csaSqMm === query.csaSqMm && r.coreCount === query.coreCount,
    );
    if (row) {
      return {
        row,
        table,
        ref: `${table.source.document}, page ${table.source.page}, ${table.source.table} (works data)`,
      };
    }
  }
  return null;
}

/** The catalogue's figures for one armour choice, or null where it does not offer that armour. */
export function catalogueForArmour(
  row: CatalogueRow,
  armour: CatalogueArmour,
): { outerSheathThicknessMm: number; overallDiaMm: number; massKgPerKm?: number; armourSize?: string } | null {
  if (armour === "unarmoured") return row.unarmoured;
  if (armour === "strip") {
    return row.strip ? { ...row.strip, armourSize: row.strip.stripSize } : null;
  }
  return row.roundWire
    ? { ...row.roundWire, armourSize: `${row.roundWire.wireDiaMm} mm dia` }
    : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Where the works and the standards disagree
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Known divergences between this catalogue and the encoded standards.
 *
 * Carried, not resolved. A works catalogue is allowed to differ from a standard — a GTP can
 * specify tighter or looser than IS, and once the customer stamps it, that becomes the binding
 * spec (Niraj, 13 Sept). What must not happen is the difference passing unnoticed.
 */
export const CATALOGUE_DIVERGENCES: readonly {
  subject: string;
  catalogue: string;
  standard: string;
  note: string;
}[] = [
  {
    subject: "Reduced neutral at 50 sq mm — likely a misprint in the brochure",
    catalogue: "Size column reads 50/16; neutral insulation column reads 0.9 mm",
    standard: "IS 7098 (Part 1) Table 2 gives 50/25, and Table 3 gives 0.9 mm to a 25 sq mm core",
    note:
      "The row contradicts ITSELF, which is what makes this more than a difference of practice. " +
      "Its neutral insulation wall is 0.9 mm — the Table 3 thickness for a 25 sq mm conductor; a " +
      "16 sq mm conductor takes 0.7 mm. So the wall column describes a 25 sq mm neutral while the " +
      "size label says 16. Every other row in the table is internally consistent and matches " +
      "Table 2 exactly (25/16, 35/16, 70/35, 95/50, 120/70, 150/70, 185/95, 240/120, 300/150, " +
      "400/185, 500/240), and each neutral wall matches Table 3 for its own size. Two independent " +
      "columns agreeing on 25 against one label saying 16 reads as a printing error in the " +
      "brochure. Transcribed AS PRINTED rather than silently corrected — confirm with the works, " +
      "then fix the data here. A GTP issued on 50/16 against a customer expecting Table 2 would " +
      "fail inspection.",
  },
] as const;
