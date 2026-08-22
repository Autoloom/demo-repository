/**
 * IS 14255:1995 — Aerial Bunched Cables for working voltages up to and including 1100 V.
 *
 * Governs the AB-cable master spec: insulation thickness by size, current ratings,
 * phase→messenger (neutral-cum-messenger) size pairing, and lay rules.
 *
 * VERSIONED, IMMUTABLE. Every row carries its `ref` clause.
 *
 * ── VERIFICATION (encoding SOP step 2) ───────────────────────────────────────
 * Verified against the IS 14255:1995 PDF (reaffirmed 2020), Tables 3 and 4, pp. 3–4.
 * Superseded the previous encoding, which was sourced from the DHBVN CSC-69 spec's
 * *reproduction* of these tables and carried two fabricated rows (120 sq mm) plus a
 * transcribed-wrong resistance. IS is the source of truth; buyer reproductions are untrusted
 * (build-plan-v2 D1).
 *
 * Not in this standard, so not encoded here:
 *  • Current ratings / de-rating — IS 3961 (not held).
 *  • Messenger alloy modulus, expansion coefficient, composition — IS 398 (Part 4) (not held).
 *  • Drum dimensions and tare — IS 10418 (not held).
 */

export interface ABInsulationRow {
  csaSqMm: number;
  insulationThicknessMinMm: number; // XLPE nominal wall thickness
  currentRatingA: number; // continuous current rating (at reference temperature)
  currentRatingRefTempC: number; // reference ambient for the rating above
  ref: string;
}

/**
 * Table 4 — Thickness of Insulation (Clause 7.2).
 *
 * ✔ VERIFIED against IS 14255:1995 p.4, Table 4. Six rows: the printed table ENDS at 95 sq mm.
 *
 * ⚠️ CORRECTION: an earlier encoding carried a 120 sq mm row at 1.6 mm, taken from the DHBVN
 * CSC-69 spec's reproduction rather than IS 14255. The IS table has no 120 row. Removed.
 *
 * Current ratings are NOT in IS 14255 — the standard gives no ampacity table. Ratings come from
 * IS 3961, which we do not hold (build-plan-v1 §1.2, S-3961). The 70 and 16 sq mm values below
 * are read off the approved KRYFS PKG-30 GTP; the rest are unsourced and marked accordingly.
 */
export const IS14255_1995_PHASE: ABInsulationRow[] = [
  {
    csaSqMm: 16,
    insulationThicknessMinMm: 1.2, // ✔ IS 14255:1995 Table 4
    currentRatingA: 63, // ✔ KRYFS PKG-30 (street-light core)
    currentRatingRefTempC: 40,
    ref: "IS 14255:1995, Table 4 (16 sq mm)",
  },
  {
    csaSqMm: 25,
    insulationThicknessMinMm: 1.2, // ✔ IS 14255:1995 Table 4
    currentRatingA: 90, // GAP: not in IS 14255; needs IS 3961
    currentRatingRefTempC: 40,
    ref: "IS 14255:1995, Table 4 (25 sq mm)",
  },
  {
    csaSqMm: 35,
    insulationThicknessMinMm: 1.2, // ✔ IS 14255:1995 Table 4
    currentRatingA: 110, // GAP: needs IS 3961
    currentRatingRefTempC: 40,
    ref: "IS 14255:1995, Table 4 (35 sq mm)",
  },
  {
    csaSqMm: 50,
    insulationThicknessMinMm: 1.5, // ✔ IS 14255:1995 Table 4
    currentRatingA: 125, // GAP: needs IS 3961
    currentRatingRefTempC: 40,
    ref: "IS 14255:1995, Table 4 (50 sq mm)",
  },
  {
    csaSqMm: 70,
    insulationThicknessMinMm: 1.5, // ✔ IS 14255:1995 Table 4 + KRYFS PKG-30
    currentRatingA: 154, // ✔ KRYFS PKG-30
    currentRatingRefTempC: 40,
    ref: "IS 14255:1995, Table 4 (70 sq mm)",
  },
  {
    csaSqMm: 95,
    insulationThicknessMinMm: 1.5, // ✔ IS 14255:1995 Table 4
    currentRatingA: 185, // GAP: needs IS 3961
    currentRatingRefTempC: 40,
    ref: "IS 14255:1995, Table 4 (95 sq mm)",
  },
];

/**
 * Table 3 — Size and Requirements of Messenger Conductor (Clause 6.5).
 *
 * ✔ VERIFIED against IS 14255:1995 p.3, Table 3. Six rows only: the printed table ENDS at
 * 95 sq mm phase. There is no 120 sq mm row in the standard.
 *
 * ⚠️ CORRECTION (build-plan-v1 finding X-2, resolved): an earlier encoding of this table carried
 * a seventh row — 120→70 @ 0.253 ohm/km, 20.6 kN — taken from the DHBVN CSC-69 spec's
 * *reproduction* of "the IS 14255 table", not from IS 14255 itself. The IS source shows the table
 * stops at 95, and gives the 70 sq mm messenger 0.492 ohm/km / 19.7 kN. The buyer document's
 * 0.253 is the 120 sq mm PHASE resistance transcribed into the messenger column — the same class
 * of error this engine exists to catch. IS is the source of truth (build-plan-v2 D1); buyer
 * reproductions are untrusted.
 */
export const IS14255_1995_MESSENGER_PAIRING: {
  phaseSqMm: number;
  messengerSqMm: number;
  minBreakingLoadKN: number;
  maxDcResistanceOhmPerKm: number;
  ref: string;
}[] = [
  { phaseSqMm: 16, messengerSqMm: 25, minBreakingLoadKN: 7.0, maxDcResistanceOhmPerKm: 1.38, ref: "IS 14255:1995, Table 3, Sl. i" },
  { phaseSqMm: 25, messengerSqMm: 25, minBreakingLoadKN: 7.0, maxDcResistanceOhmPerKm: 1.38, ref: "IS 14255:1995, Table 3, Sl. ii" },
  { phaseSqMm: 35, messengerSqMm: 25, minBreakingLoadKN: 7.0, maxDcResistanceOhmPerKm: 1.38, ref: "IS 14255:1995, Table 3, Sl. iii" },
  { phaseSqMm: 50, messengerSqMm: 35, minBreakingLoadKN: 9.8, maxDcResistanceOhmPerKm: 0.986, ref: "IS 14255:1995, Table 3, Sl. iv" },
  { phaseSqMm: 70, messengerSqMm: 50, minBreakingLoadKN: 14.0, maxDcResistanceOhmPerKm: 0.689, ref: "IS 14255:1995, Table 3, Sl. v" },
  { phaseSqMm: 95, messengerSqMm: 70, minBreakingLoadKN: 19.7, maxDcResistanceOhmPerKm: 0.492, ref: "IS 14255:1995, Table 3, Sl. vi" },
];

export function findPhaseRow(csaSqMm: number): ABInsulationRow | undefined {
  return IS14255_1995_PHASE.find((r) => r.csaSqMm === csaSqMm);
}

export function messengerSizeForPhase(phaseSqMm: number): { messengerSqMm: number; ref: string } | undefined {
  return IS14255_1995_MESSENGER_PAIRING.find((r) => r.phaseSqMm === phaseSqMm);
}

/**
 * Clause-level rules (not tables). All ✔ verified against IS 14255:1995.
 *
 * NOTE on `maxLayRatio`: text extraction of §9.1 renders this as "3.5 times" — an OCR corruption
 * (build-plan-v1 finding X-3). The rendered page reads **35 times**, corroborated by DHBVN
 * CSC-69 §1.8. This is why every row is verified against the page, never accepted from extraction.
 */
export const IS14255_1995_RULES = {
  /** §9.1 — cores twisted around the messenger WITHOUT fillers. */
  maxLayRatio: 35,
  layRatioBasis: "diameter of the insulated phase conductor",
  fillers: "none" as const,
  /** §9.2 */
  layDirection: "right hand" as const,
  /** §7.5 */
  insulationColour: "black" as const,
  /** §6.2 — messenger: stranded or compacted circular, minimum 7 strands, smooth surface. */
  messengerMinStrands: 7,
  /** §6.4 — the street-light conductor size is FIXED by the standard. */
  streetLightCsaSqMm: 16,
  /** §8.1 — phase 1/2/3 ridges; insulated outer neutral 4 ridges; SL & messenger unmarked. */
  coreIdentification: "Phase conductors: one, two or three ridges. Outer insulated neutral (if provided): four ridges. Street-light and messenger conductors: no identification mark.",
  /** §12.2 — XLPE-insulated cable carries the legend 'XLPE 90' + year of manufacture. */
  cableLegend: "XLPE 90",
  ref: "IS 14255:1995, clauses 6.2, 6.4, 7.5, 8.1, 9.1, 9.2, 12.2",
} as const;

/**
 * §7.3 — tolerance on thickness of insulation. The smallest measured value shall not fall below
 * the nominal ti by more than `0.1 mm + 0.1·ti`. Same form as IS 1554-1 §9.3.
 */
export function insulationToleranceFloorMm(nominalTi: number): number {
  return nominalTi - (0.1 + 0.1 * nominalTi);
}

/** Back-compat alias; prefer IS14255_1995_RULES. */
export const IS14255_1995_LAY = {
  maxLayRatio: IS14255_1995_RULES.maxLayRatio,
  direction: IS14255_1995_RULES.layDirection,
  ref: "IS 14255:1995, clauses 9.1–9.2",
};

export const IS14255_1995_EDITION = "1995";
/** Reaffirmed 2005, 2015, 2020. Amendment No. 1 (Oct 2010) adds single-phase provisions. */
export const IS14255_1995_REAFFIRMED = "2020";
