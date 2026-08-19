/**
 * IS 398 Part 4 — Aluminium alloy stranded conductors (Al-Mg-Si) for the messenger.
 *
 * The messenger is the neutral-cum-messenger wire that carries the AB cable's mechanical load.
 * VERSIONED, IMMUTABLE. Every row carries its `ref`.
 *
 * SOURCES:
 *  • ✔ KRYFS PKG-30 approved GTP (§0.5): 50 sq mm full row (7 strands, 7.98 mm, 14 kN,
 *    modulus 0.6324×10⁶ kg/cm², expansion 23.0×10⁻⁶/°C, 0.689 ohm/km, 128 A).
 *  • ✔ DHBVN CSC-69 spec (corpus S1): §1.5.2.1 — Al alloy ~0.5% Mg + ~0.5% Si, ALL messengers
 *    7 strands, compacted round; §1.5.2.3 — breaking loads & resistances per size.
 *  Remaining `// GAP` values (compacted dia, modulus for non-50, ampacity) await IS 398-4 (T1-2).
 *
 * Note: S1's pairing row for 120→70 prints 20.6 kN vs 19.7 kN for 95→70 (same 70 sq mm size).
 * The per-combination requirement lives in is14255-1995.ts pairing rows; this module keys
 * alloy properties by size alone and carries the 19.7 kN base value for 70 sq mm.
 */

export interface MessengerRow {
  csaSqMm: number;
  strands: number;
  compactedDiaMm: number;
  breakingLoadKN: number;
  modulusKgPerCm2: number; // Young's modulus
  expansionPerC: number; // linear expansion coefficient per °C
  maxDcResistanceOhmPerKm: number;
  currentRatingA: number;
  siliconPercentApprox: number; // Al-Mg-Si alloy composition marker
  ref: string;
}

export const IS398_4_MESSENGER: MessengerRow[] = [
  {
    csaSqMm: 25,
    strands: 7, // ✔ S1 §1.5.2.1 (all messengers 7 strands)
    compactedDiaMm: 5.7, // GAP
    breakingLoadKN: 7.0, // ✔ S1 §1.5.2.3
    modulusKgPerCm2: 0.6324e6, // GAP: assumed same alloy as 50 sq mm row
    expansionPerC: 23.0e-6,
    maxDcResistanceOhmPerKm: 1.38, // ✔ S1 §1.5.2.3
    currentRatingA: 90, // GAP
    siliconPercentApprox: 0.5,
    ref: "IS 398 Pt-4, Al-Mg-Si messenger (25 sq mm; DHBVN CSC-69 §1.5.2.3)",
  },
  {
    csaSqMm: 35,
    strands: 7, // ✔ S1 §1.5.2.1
    compactedDiaMm: 6.7, // GAP
    breakingLoadKN: 9.8, // ✔ S1 §1.5.2.3
    modulusKgPerCm2: 0.6324e6, // GAP
    expansionPerC: 23.0e-6,
    maxDcResistanceOhmPerKm: 0.986, // ✔ S1 §1.5.2.3
    currentRatingA: 110, // GAP
    siliconPercentApprox: 0.5,
    ref: "IS 398 Pt-4, Al-Mg-Si messenger (35 sq mm; DHBVN CSC-69 §1.5.2.3)",
  },
  {
    // ✔ Full row verified against approved KRYFS PKG-30 GTP (§0.5).
    csaSqMm: 50,
    strands: 7,
    compactedDiaMm: 7.98,
    breakingLoadKN: 14,
    modulusKgPerCm2: 0.6324e6,
    expansionPerC: 23.0e-6,
    maxDcResistanceOhmPerKm: 0.689,
    currentRatingA: 128,
    siliconPercentApprox: 0.5,
    ref: "IS 398 Pt-4, Al-Mg-Si messenger (50 sq mm; KRYFS PKG-30)",
  },
  {
    csaSqMm: 70,
    strands: 7, // ✔ S1 §1.5.2.1 (was 19 — corrected)
    compactedDiaMm: 9.5, // GAP
    breakingLoadKN: 19.7, // ✔ S1 §1.5.2.3 (95→70 row; 120→70 demands 20.6 — see module note)
    modulusKgPerCm2: 0.6324e6, // GAP
    expansionPerC: 23.0e-6,
    maxDcResistanceOhmPerKm: 0.492, // ✔ S1 §1.5.2.3 (95→70 row; the 120-row's 0.253 is a spec artifact)
    currentRatingA: 160, // GAP
    siliconPercentApprox: 0.5,
    ref: "IS 398 Pt-4, Al-Mg-Si messenger (70 sq mm; DHBVN CSC-69 §1.5.2.3)",
  },
];

export function findMessengerRow(csaSqMm: number): MessengerRow | undefined {
  return IS398_4_MESSENGER.find((r) => r.csaSqMm === csaSqMm);
}

export const IS398_4_EDITION = "1994";
