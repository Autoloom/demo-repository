/**
 * IEC 62930 : 2017 — Electric cables for photovoltaic systems with a voltage rating of 1,5 kV DC.
 * Edition 1.0. With EN 50618 : 2014 (SIST EN 50618:2015), its European counterpart.
 *
 * ─── ⚠️ PARTIAL ENCODING — READ THIS BEFORE USING ─────────────────────────────────────────────
 *
 * Both documents supplied are iTeh "STANDARD PREVIEW" extracts, not the full standards. The
 * readable pages end at page 12; the dimensional tables sit on pages 13-14 and are NOT included:
 *
 *   • IEC 62930 Table 1 — dimensional and insulation-resistance values, class 5 conductors
 *   • IEC 62930 Table 2 — the same for class 2 conductors
 *   • EN 50618  Table 1 — dimensional and insulation-resistance values
 *
 * Those tables carry the four values a solar GTP actually needs: insulation thickness, sheath
 * thickness, overall diameter limits and insulation resistance, each per conductor size.
 *
 * So this module encodes the CLAUSES (which are complete and unambiguous in the preview) and
 * deliberately encodes NO dimensional values. `SOLAR_TABLES_HELD` is false, and the cable type
 * stays unavailable, because a solar GTP without insulation thickness is not a GTP.
 *
 * There is no safe way to fill this gap by inference. Solar cable thicknesses are NOT the same
 * as the IS 7098-1 or IEC 60502 values already encoded — these are 1.5 kV DC cables with a
 * 25-year outdoor life and a 120 °C excursion rating, and their walls are sized accordingly.
 * Borrowing a neighbouring standard's numbers would be exactly the fabrication that put an
 * invented messenger pairing into IS 14255 earlier in this project.
 *
 * TO FINISH THIS TYPE: supply pages 13-14 of either standard (one is enough — see the note on
 * equivalence below) and the tables drop straight in; the derivation is a flat per-size lookup
 * with no build-up chain, so no engine work is required.
 */
import type { StandardsDataset } from "./types";

export const IEC62930_2017: StandardsDataset = {
  standardId: "IEC62930",
  edition: "2017",
  body: "IEC",
  title: "Electric cables for photovoltaic systems with a voltage rating of 1,5 kV DC",
  status: "draft",
  sourceFile: "IEC-62930-2017_solar.pdf",
  coverageNote:
    "CLAUSES ONLY. The supplied PDF is an iTeh preview extract ending at page 12; Tables 1 and 2 " +
    "(dimensional and insulation-resistance values, pages 13-14) are not included. No dimensional " +
    "value is encoded and none may be inferred.",
};

export const EN50618_2014: StandardsDataset = {
  standardId: "EN50618",
  edition: "2014",
  body: "CENELEC",
  title: "Electric cables for photovoltaic systems (BT(DE/NOT)258)",
  status: "draft",
  sourceFile: "SIST-EN-50618-2015_solar.pdf",
  coverageNote:
    "CLAUSES ONLY. Same preview limitation — Table 1 (page 14) is not included.",
};

/**
 * Whether the dimensional tables are held. Gates the cable type; see cable-types.ts.
 * Flip to true ONLY when Tables 1/2 have actually been transcribed and verified.
 */
export const SOLAR_TABLES_HELD = false;

/** Exactly what is missing, so the blocker can be stated precisely rather than vaguely. */
export const SOLAR_MISSING_TABLES = [
  { standard: "IEC 62930 : 2017", table: "Table 1", page: 13, describes: "Dimensional and insulation resistance values — class 5 conductor cables" },
  { standard: "IEC 62930 : 2017", table: "Table 2", page: 14, describes: "Dimensional and insulation resistance values — class 2 conductor cables" },
  { standard: "EN 50618 : 2014", table: "Table 1", page: 14, describes: "Dimensional and insulation resistance values" },
] as const;

/** The four columns those tables carry, and which a solar GTP cannot be produced without. */
export const SOLAR_MISSING_VALUES = [
  "insulation thickness per conductor size",
  "sheath thickness per conductor size",
  "overall diameter, lower and upper limits",
  "insulation resistance per conductor size",
] as const;

// ── Clauses (complete, from the readable pages) ────────────────────────────────────────────

/** §1 — scope and thermal ratings. The 120 °C allowance is time-limited, not continuous. */
export const IEC62930_SCOPE = {
  construction: "Single-core cross-linked insulated power cable with cross-linked sheath",
  ratedVoltageDcV: 1500,
  /** EN 50618 §4 adds an AC rating for the same cable. */
  ratedVoltageAcV: 1000,
  maxContinuousConductorTempC: 90,
  excursionConductorTempC: 120,
  excursionMaxHours: 20000,
  expectedServiceLifeYears: 25,
  equipmentClass: "Class II (IEC 61140)",
  ref: "IEC 62930 : 2017, §1 and §4",
} as const;

/**
 * §5.1.1 — conductor material. Not a choice: copper, and TIN COATED, with the coating
 * continuous and free of visible gaps. Both standards word this identically.
 */
export const IEC62930_CONDUCTOR = {
  material: "CU" as const,
  tinCoated: true,
  coatingRequirement: "Continuous layer of tin coating, no visible gaps under normal or corrected vision",
  perStandard: "IEC 60228",
  ref: "IEC 62930 : 2017, §5.1.1",
} as const;

/**
 * §5.1.2 — conductor class.
 *
 * Class 5 (flexible) for cable connected directly to PV modules; Class 2 is permitted only for
 * fixed installation NOT directly connected to the modules. That distinction is why IEC 62930
 * has two dimensional tables where EN 50618 has one — EN 50618 §5.1.2 specifies class 5 only.
 */
export type SolarConductorClass = "Class 5" | "Class 2";

export function permittedConductorClass(directlyConnectedToModules: boolean): {
  klass: SolarConductorClass;
  ref: string;
} {
  return directlyConnectedToModules
    ? { klass: "Class 5", ref: "IEC 62930 : 2017, §5.1.2" }
    : { klass: "Class 2", ref: "IEC 62930 : 2017, §5.1.2 (fixed installation, not directly connected)" };
}

/** §5.2 — insulation. */
export const IEC62930_INSULATION = {
  material: "Cross-linked compound meeting Annex B Table B.1",
  application: "Extruded, fitting closely, removable without damage to insulation, conductor or tin coating",
  multiLayerAllowed: true,
  multiLayerNote: "Multiple non-separable layers are tested as though a single layer, and do NOT constitute double insulation",
  separatorAllowed: "Non-metallic; must be halogen free in a halogen-free low-smoke cable (§5.1.3)",
  ref: "IEC 62930 : 2017, §5.2",
} as const;

/**
 * §5.2.3 — insulation thickness tolerance.
 *
 *   average (rounded to 0.1 mm) >= specified;  and  t_m >= 0.9·t_s − 0.1
 *
 * Note this is a DIFFERENT rule from the BIS one (nominal − (0.1 + 0.1·t)), so it cannot be
 * shared with protective-coverings.ts. Encoded here even though `t_s` itself is unavailable —
 * the rule is complete, only its input is missing.
 */
export function solarInsulationToleranceFloorMm(specifiedTsMm: number): number {
  return 0.9 * specifiedTsMm - 0.1;
}

/** EN 50618 §5.3.3 — sheath tolerance is looser than insulation: 0.85 rather than 0.9. */
export function solarSheathToleranceFloorMm(specifiedTsMm: number): number {
  return 0.85 * specifiedTsMm - 0.1;
}

/** EN 50618 §5.3 — sheath. Black unless the customer agrees otherwise, and coloured throughout. */
export const EN50618_SHEATH = {
  material: "Cross-linked, meeting Annex B Table B.1",
  application: "Extruded homogeneously; finished cable practically circular",
  colour: "Black unless otherwise agreed between manufacturer and customer",
  colourDepth: "Throughout the whole of the sheath",
  separatorAllowed: true,
  ref: "EN 50618 : 2014, §5.3",
} as const;

/** EN 50618 §6.3 — the designation every conforming cable is marked with. */
export const EN50618_CODE_DESIGNATION = "H1Z2Z2-K";

/** EN 50618 §6 — marking requirements. */
export const EN50618_MARKING = {
  codeDesignation: EN50618_CODE_DESIGNATION,
  method: "Printing, embossing or indenting on the sheath",
  originRequired: "Manufacturer's name, trademark, or protected identification number",
  crossSectionRequired: "Nominal cross-sectional area, e.g. '2,5 mm²'",
  maxGapBetweenMarksMm: 550,
  cenelecNameProhibited: true,
  ref: "EN 50618 : 2014, §6",
} as const;

/**
 * IEC 62930 §5.4 — multi-core. The scope is single-core; this clause exists to say so.
 * A multi-core "solar cable" is outside both standards.
 */
export const IEC62930_SINGLE_CORE_ONLY = true;

/**
 * Are IEC 62930 and EN 50618 interchangeable for our purposes?
 *
 * For the CLAUSES encoded above: near enough identical, and where they differ it is noted
 * inline. For the TABLES: unknown, and it must not be assumed. IEC 62930 splits class 5 and
 * class 2 across two tables where EN 50618 has one class-5 table, so the documents are not
 * simply translations of each other. Whichever table arrives should be encoded and cited as
 * itself, not treated as standing in for the other.
 */
export const SOLAR_STANDARDS_EQUIVALENCE_NOTE =
  "Clauses align closely. The dimensional tables must NOT be assumed equivalent: IEC 62930 " +
  "carries separate class 5 and class 2 tables where EN 50618 covers class 5 only.";
