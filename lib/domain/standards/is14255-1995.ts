/**
 * IS 14255:1995 — Aerial Bunched Cables for working voltages up to and including 1100 V.
 *
 * Governs the AB-cable master spec: insulation thickness by size, current ratings,
 * phase→messenger (neutral-cum-messenger) size pairing, and lay rules.
 *
 * VERSIONED, IMMUTABLE (design-doc §0.3). Every row carries its `ref` clause.
 *
 * SOURCES:
 *  • ✔ KRYFS PKG-30 approved GTP (spec §0.5) — 70 sq mm phase row, 70→50 pairing.
 *  • ✔ DHBVN/UHBVN CSC-69/2011-12 spec (corpus S1) §1.5.2.3 (messenger pairing table,
 *    stated "as per IS:14255") and §1.7 (insulation thickness table) — all seven sizes.
 *  Current ratings (ampacity) are NOT given by S1; non-verified ones remain `// GAP`
 *  pending the IS 14255 PDF (collection item I1).
 */

export interface ABInsulationRow {
  csaSqMm: number;
  insulationThicknessMinMm: number; // XLPE nominal wall thickness
  currentRatingA: number; // continuous current rating (at reference temperature)
  currentRatingRefTempC: number; // reference ambient for the rating above
  ref: string;
}

/** Phase-conductor insulation & ampacity (XLPE, 90°C). Thickness ✔ verified for all sizes [S1 §1.7]. */
export const IS14255_1995_PHASE: ABInsulationRow[] = [
  {
    csaSqMm: 16,
    insulationThicknessMinMm: 1.2, // ✔ S1 §1.7
    currentRatingA: 63, // ✔ KRYFS §0.5 (street-light core)
    currentRatingRefTempC: 40,
    ref: "IS 14255:1995 §1.7 table (16 sq mm; DHBVN CSC-69)",
  },
  {
    csaSqMm: 25,
    insulationThicknessMinMm: 1.2, // ✔ S1 §1.7
    currentRatingA: 90, // GAP: ampacity not in S1
    currentRatingRefTempC: 40,
    ref: "IS 14255:1995 §1.7 table (25 sq mm; DHBVN CSC-69)",
  },
  {
    csaSqMm: 35,
    insulationThicknessMinMm: 1.2, // ✔ S1 §1.7
    currentRatingA: 110, // GAP
    currentRatingRefTempC: 40,
    ref: "IS 14255:1995 §1.7 table (35 sq mm; DHBVN CSC-69)",
  },
  {
    csaSqMm: 50,
    insulationThicknessMinMm: 1.5, // ✔ S1 §1.7
    currentRatingA: 125, // GAP
    currentRatingRefTempC: 40,
    ref: "IS 14255:1995 §1.7 table (50 sq mm; DHBVN CSC-69)",
  },
  {
    csaSqMm: 70,
    insulationThicknessMinMm: 1.5, // ✔ S1 §1.7 + KRYFS §0.5
    currentRatingA: 154, // ✔ KRYFS §0.5
    currentRatingRefTempC: 40,
    ref: "IS 14255:1995 §1.7 table (70 sq mm; DHBVN CSC-69 + KRYFS PKG-30)",
  },
  {
    csaSqMm: 95,
    insulationThicknessMinMm: 1.5, // ✔ S1 §1.7
    currentRatingA: 185, // GAP
    currentRatingRefTempC: 40,
    ref: "IS 14255:1995 §1.7 table (95 sq mm; DHBVN CSC-69)",
  },
  {
    csaSqMm: 120,
    insulationThicknessMinMm: 1.6, // ✔ S1 §1.7
    currentRatingA: 215, // GAP
    currentRatingRefTempC: 40,
    ref: "IS 14255:1995 §1.7 table (120 sq mm; DHBVN CSC-69)",
  },
];

/**
 * Phase → messenger pairing with the spec's own requirement values [S1 §1.5.2.3, all ✔ verified].
 *
 * ⚠️ Row-7 anomaly, preserved deliberately: the official DHBVN table prints max DC resistance
 * 0.253 ohm/km for the 120→70 row — physically impossible for 70 sq mm alloy (50 sq mm = 0.689,
 * so 70 ≈ 0.492; 0.253 is the 120 sq mm PHASE value). A transcription artifact in the official
 * spec — the same error class the validation engine catches in the KRYFS GTP. We encode the
 * printed value verbatim in `specPrintedResistanceOhmPerKm` and key real alloy properties by
 * size in is398-4.ts.
 */
export const IS14255_1995_MESSENGER_PAIRING: {
  phaseSqMm: number;
  messengerSqMm: number;
  minBreakingLoadKN: number;
  specPrintedResistanceOhmPerKm: number;
  ref: string;
}[] = [
  { phaseSqMm: 16, messengerSqMm: 25, minBreakingLoadKN: 7.0, specPrintedResistanceOhmPerKm: 1.38, ref: "IS 14255:1995 pairing (16→25; DHBVN CSC-69 §1.5.2.3)" },
  { phaseSqMm: 25, messengerSqMm: 25, minBreakingLoadKN: 7.0, specPrintedResistanceOhmPerKm: 1.38, ref: "IS 14255:1995 pairing (25→25; DHBVN CSC-69 §1.5.2.3)" },
  { phaseSqMm: 35, messengerSqMm: 25, minBreakingLoadKN: 7.0, specPrintedResistanceOhmPerKm: 1.38, ref: "IS 14255:1995 pairing (35→25; DHBVN CSC-69 §1.5.2.3)" },
  { phaseSqMm: 50, messengerSqMm: 35, minBreakingLoadKN: 9.8, specPrintedResistanceOhmPerKm: 0.986, ref: "IS 14255:1995 pairing (50→35; DHBVN CSC-69 §1.5.2.3)" },
  { phaseSqMm: 70, messengerSqMm: 50, minBreakingLoadKN: 14.0, specPrintedResistanceOhmPerKm: 0.689, ref: "IS 14255:1995 pairing (70→50; DHBVN CSC-69 §1.5.2.3 + KRYFS PKG-30)" },
  { phaseSqMm: 95, messengerSqMm: 70, minBreakingLoadKN: 19.7, specPrintedResistanceOhmPerKm: 0.492, ref: "IS 14255:1995 pairing (95→70; DHBVN CSC-69 §1.5.2.3)" },
  { phaseSqMm: 120, messengerSqMm: 70, minBreakingLoadKN: 20.6, specPrintedResistanceOhmPerKm: 0.253, ref: "IS 14255:1995 pairing (120→70; DHBVN CSC-69 §1.5.2.3 — printed resistance is a spec transcription artifact, see module note)" },
];

export function findPhaseRow(csaSqMm: number): ABInsulationRow | undefined {
  return IS14255_1995_PHASE.find((r) => r.csaSqMm === csaSqMm);
}

export function messengerSizeForPhase(phaseSqMm: number): { messengerSqMm: number; ref: string } | undefined {
  return IS14255_1995_MESSENGER_PAIRING.find((r) => r.phaseSqMm === phaseSqMm);
}

/** Lay rule [S1 §1.8]: cores twisted around the messenger, lay ≤ 35 × dia of insulated phase; right hand. */
export const IS14255_1995_LAY = {
  maxLayRatio: 35,
  direction: "right hand" as const,
  ref: "IS 14255:1995 assembly (DHBVN CSC-69 §1.8)",
};

export const IS14255_1995_EDITION = "1995";
