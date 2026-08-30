/**
 * IS 10462 (Part 1) : 1983 — Fictitious calculation method for determination of dimensions of
 * protective coverings of cables. Part I: elastomeric and thermoplastic insulated cables.
 * Reaffirmed 2001, 2011, 2016, 2021.
 *
 * THIS IS THE KEYSTONE. Almost every sheath and armour table in IS 7098-1 and IS 1554-1 is keyed
 * by "calculated diameter [Ref IS 10462 (Part 1)]" — not by conductor size. Without this module
 * those tables cannot be looked up at all, which is why LT power and control were blocked.
 *
 * ─── What "fictitious" means ──────────────────────────────────────────────────────────────────
 *
 * §0.3: the method deliberately IGNORES conductor shape and compactness. It computes a notional
 * diameter from cross-sectional area alone, so that every manufacturer keying into the sheath and
 * armour tables lands on the same row for the same cable. The fictitious diameter is NOT a
 * prediction of the physical cable.
 *
 * §0.4 is explicit: "The fictitious calculation is used only to determine dimensions of sheaths
 * and cable coverings. It is not a replacement for the calculation of normal diameters required
 * for practical purposes, which should be calculated separately."
 *
 * So this module answers "which row of the sheath table applies?" — never "how thick is the
 * finished cable?". Those are two different numbers and conflating them is the classic error.
 * A 3-core 70 sq mm cable has a fictitious conductor diameter of exactly 9.4 mm regardless of
 * whether the real compacted conductor measures 9.44 (circular) or is sector-shaped and not
 * round at all. See `fictitiousDiameterCaveat` and the guard test.
 *
 * ─── The rounding rule (§0.7) ─────────────────────────────────────────────────────────────────
 *
 * "The calculated value of fictitious diameter AT EACH STAGE shall be rounded off to one
 * significant place of decimal, that is, 0.1 mm, BEFORE PROCEEDING TO NEXT STEP."
 *
 * This is the single most easily-missed requirement here, and it is not cosmetic. Rounding only
 * at the end produces a different value from rounding at each stage, and near a band boundary in
 * IS 7098-1 Table 5 that difference selects a DIFFERENT SHEATH THICKNESS. Every step function
 * below therefore rounds its own output, and the chain builder never accumulates unrounded
 * intermediates. Guarded by a regression test.
 *
 * §0.7 pins rounding to IS 2:1960. That is round-half-away-from-zero, NOT JavaScript's
 * Math.round (which is round-half-up: Math.round(-0.5) === -0. Diameters are positive so the
 * distinction is inert here, but `roundToTenth` implements the standard's rule so the primitive
 * stays correct if reused).
 *
 * Encoding status: DRAFT. Tables 1-3 are transcribed from the supplied BIS PDF and structurally
 * validated, but per the encoding SOP a human must confirm each row against the rendered page
 * before this is marked verified.
 */
import type { StandardsDataset } from "./types";
import { StandardsLookupError } from "./types";

export const IS10462_1_1983: StandardsDataset = {
  standardId: "IS10462-1",
  edition: "1983",
  body: "BIS",
  title:
    "Fictitious calculation method for determination of dimensions of protective coverings of cables, Part I: Elastomeric and thermoplastic insulated cables",
  status: "draft",
  reaffirmed: "2021",
  sourceFile: "10462_1_1983_reff2021.pdf",
  coverageNote:
    "Complete: Tables 1-3 and the §3.2-3.5 formulae are all the standard contains. Part II " +
    "(paper-insulated cables, §0.5) is a separate standard and is not held — but no product " +
    "in scope is paper-insulated.",
};

/** Human-readable restatement of §0.4, for surfacing in the UI next to any fictitious value. */
export const fictitiousDiameterCaveat =
  "Fictitious diameter (IS 10462 Part 1). Used only to select rows in the sheath and armour " +
  "tables — it ignores conductor shape and compactness by design (§0.3) and is not the actual " +
  "cable diameter (§0.4).";

/**
 * Round to 0.1 mm per §0.7 / IS 2:1960 (round half away from zero).
 *
 * The 1e-9 nudge absorbs binary-float error: 8.25 is stored slightly below its decimal value, so
 * a naive scale-and-round yields 8.2 where the standard's decimal arithmetic gives 8.3.
 */
export function roundToTenth(mm: number): number {
  const scaled = mm * 10;
  const rounded = scaled < 0
    ? -Math.floor(-scaled + 0.5 + 1e-9)
    : Math.floor(scaled + 0.5 + 1e-9);
  return rounded / 10;
}

/** TABLE 1 — Fictitious diameter of conductor in cables for FIXED INSTALLATIONS (Clause 3.1). */
export const IS10462_TABLE1_FIXED: ReadonlyArray<{ csaSqMm: number; dLMm: number }> = [
  { csaSqMm: 1.5, dLMm: 1.4 },
  { csaSqMm: 2.5, dLMm: 1.8 },
  { csaSqMm: 4, dLMm: 2.3 },
  { csaSqMm: 6, dLMm: 2.8 },
  { csaSqMm: 10, dLMm: 3.6 },
  { csaSqMm: 16, dLMm: 4.5 },
  { csaSqMm: 25, dLMm: 5.6 },
  { csaSqMm: 35, dLMm: 6.7 },
  { csaSqMm: 50, dLMm: 8.0 },
  { csaSqMm: 70, dLMm: 9.4 },
  { csaSqMm: 95, dLMm: 11.0 },
  { csaSqMm: 120, dLMm: 12.4 },
  { csaSqMm: 150, dLMm: 13.8 },
  { csaSqMm: 185, dLMm: 15.3 },
  { csaSqMm: 240, dLMm: 17.5 },
  { csaSqMm: 300, dLMm: 19.5 },
  { csaSqMm: 400, dLMm: 22.6 },
  { csaSqMm: 500, dLMm: 25.2 },
  { csaSqMm: 630, dLMm: 28.3 },
  { csaSqMm: 800, dLMm: 31.9 },
  { csaSqMm: 1000, dLMm: 35.7 },
];

/** TABLE 2 — Fictitious diameter of conductor in FLEXIBLE CABLES (Clause 3.1). */
export const IS10462_TABLE2_FLEXIBLE: ReadonlyArray<{ csaSqMm: number; dLMm: number }> = [
  { csaSqMm: 0.5, dLMm: 0.9 },
  { csaSqMm: 0.75, dLMm: 1.1 },
  { csaSqMm: 1, dLMm: 1.3 },
  { csaSqMm: 1.5, dLMm: 1.6 },
  { csaSqMm: 2.5, dLMm: 2.0 },
  { csaSqMm: 4, dLMm: 2.6 },
  { csaSqMm: 6, dLMm: 3.6 },
  { csaSqMm: 10, dLMm: 4.6 },
  { csaSqMm: 16, dLMm: 5.7 },
  { csaSqMm: 25, dLMm: 7.1 },
  { csaSqMm: 35, dLMm: 8.5 },
  { csaSqMm: 50, dLMm: 10.3 },
  { csaSqMm: 70, dLMm: 12.4 },
  { csaSqMm: 95, dLMm: 14.5 },
  { csaSqMm: 120, dLMm: 16.0 },
  { csaSqMm: 150, dLMm: 18.0 },
  { csaSqMm: 185, dLMm: 20.0 },
  { csaSqMm: 240, dLMm: 23.0 },
  { csaSqMm: 300, dLMm: 26.0 },
  { csaSqMm: 400, dLMm: 30.0 },
  { csaSqMm: 500, dLMm: 33.5 },
  { csaSqMm: 630, dLMm: 37.0 },
];

export type CableFlexibility = "fixed" | "flexible";

/**
 * §3.1 — fictitious conductor diameter d_L.
 *
 * Exact match only. The tables are a closed list of preferred sizes; an unlisted area has no
 * fictitious diameter and must not be interpolated (interpolating would invent a table row, which
 * is exactly the failure mode that put a fabricated messenger pairing into IS 14255 earlier).
 */
export function fictitiousConductorDiameter(
  csaSqMm: number,
  flexibility: CableFlexibility = "fixed",
): number {
  const table = flexibility === "fixed" ? IS10462_TABLE1_FIXED : IS10462_TABLE2_FLEXIBLE;
  const hit = table.find((r) => r.csaSqMm === csaSqMm);
  if (!hit) {
    throw new StandardsLookupError(
      "IS10462-1",
      flexibility === "fixed" ? "Table 1" : "Table 2",
      "csaSqMm",
      csaSqMm,
    );
  }
  return hit.dLMm;
}

/**
 * TABLE 3 — Assembly coefficient k for the fictitious diameter over laid-up cores (Clause 3.3).
 *
 * Starred entries in the printed table are "cores assembled in ONE LAYER" — a genuinely different
 * geometry that shares a core count with the multi-layer arrangement (7, 8, 9, 10, 12 and 18 each
 * appear twice with different k). Modelled as a separate `oneLayer` map rather than a second row,
 * so a caller must state which arrangement it means and cannot silently get the wrong one.
 */
export const IS10462_TABLE3_ASSEMBLY: Readonly<Record<number, number>> = {
  2: 2.0, 3: 2.16, 4: 2.42, 5: 2.7, 6: 3.0, 7: 3.0, 8: 3.45, 9: 3.8, 10: 4.0,
  11: 4.0, 12: 4.16, 13: 4.41, 14: 4.41, 15: 4.7, 16: 4.7, 17: 5.0, 18: 5.0,
  19: 5.0, 20: 5.33, 21: 5.33, 22: 5.67, 23: 5.67, 24: 6.0, 25: 6.0, 26: 6.0,
  27: 6.15, 28: 6.41, 29: 6.41, 30: 6.41, 31: 6.7, 32: 6.7, 33: 6.7, 34: 7.0,
  35: 7.0, 36: 7.0, 37: 7.0, 38: 7.33, 39: 7.33, 40: 7.33, 41: 7.67, 42: 7.67,
  43: 7.67, 44: 8.0, 45: 8.0, 46: 8.0, 47: 8.0, 48: 8.15, 52: 8.41, 61: 9.0,
};

/** Table 3 starred rows — cores assembled in one layer. */
export const IS10462_TABLE3_ONE_LAYER: Readonly<Record<number, number>> = {
  7: 3.35, 8: 3.66, 9: 4.0, 10: 4.4, 12: 5.0, 18: 7.0,
};

/**
 * Assembly coefficient k. `oneLayer` selects the starred variant, which exists only for
 * 7, 8, 9, 10, 12 and 18 cores — asking for it elsewhere is a caller error, not a fallback.
 */
export function assemblyCoefficient(cores: number, oneLayer = false): number {
  if (oneLayer) {
    const k = IS10462_TABLE3_ONE_LAYER[cores];
    if (k === undefined) {
      throw new StandardsLookupError("IS10462-1", "Table 3 (one layer)", "cores", cores);
    }
    return k;
  }
  const k = IS10462_TABLE3_ASSEMBLY[cores];
  if (k === undefined) throw new StandardsLookupError("IS10462-1", "Table 3", "cores", cores);
  return k;
}

/**
 * §3.2 — fictitious diameter of a core, D_c.
 *
 *   unscreened:  D_c = d_L + 2·t₁
 *   screened:    D_c = d_L + 2·t₁ + 3.0     (allows for semi-conducting layers ± metallic screen)
 *
 * The +3.0 applies to "cables of rated voltage requiring screening". At the 1.1 kV of everything
 * currently in scope it does not apply, but it is encoded because HT is on the roadmap and a
 * later reader must not have to re-derive it.
 */
export function fictitiousCoreDiameter(args: {
  dLMm: number;
  insulationThicknessMm: number;
  screened?: boolean;
}): number {
  const base = args.dLMm + 2 * args.insulationThicknessMm;
  return roundToTenth(args.screened ? base + 3.0 : base);
}

/**
 * §3.3 — fictitious diameter over laid-up cores, D_f.
 *
 * Three forms, per the standard:
 *   (a) all cores the same diameter:  D_f = k · D_c
 *   (b) 3½-core cables:               D_f = 2.42 · (3·D_c1 + D_c2) / 4
 *   (c) with a cradle separator:      D_f = k · (D_c + 2.5) − 2.5
 *
 * Form (b) is a fixed formula with its own embedded 2.42 (the 4-core coefficient) and takes no k
 * argument — a 3½-core cable is four cores of unequal diameter, so form (a) does not apply.
 */
export function fictitiousLaidUpDiameter(
  args:
    | { form: "uniform"; cores: number; dCMm: number; oneLayer?: boolean }
    | { form: "threeAndHalf"; fullCoreDMm: number; halfCoreDMm: number }
    | { form: "cradleSeparator"; cores: number; dCMm: number; oneLayer?: boolean },
): number {
  if (args.form === "threeAndHalf") {
    return roundToTenth((2.42 * (3 * args.fullCoreDMm + args.halfCoreDMm)) / 4);
  }
  const k = assemblyCoefficient(args.cores, args.oneLayer ?? false);
  if (args.form === "cradleSeparator") return roundToTenth(k * (args.dCMm + 2.5) - 2.5);
  return roundToTenth(k * args.dCMm);
}

/**
 * §3.4 — fictitious diameter over the inner sheath, D_B = D_f + 2·t_B.
 * This is also the fictitious diameter UNDER THE ARMOUR (§2.1), i.e. the key into the armour tables.
 */
export function fictitiousOverInnerSheath(dFMm: number, innerSheathThicknessMm: number): number {
  return roundToTenth(dFMm + 2 * innerSheathThicknessMm);
}

/**
 * §3.5 — fictitious diameter over the armour, D_X = D_B + 2·t_A.
 *
 * t_A is the armour wire diameter or strip thickness. NOTE (§3.5): for PLIABLE WIRE armour, t_A is
 * the diameter of the stranded armour, taken as 3× the diameter of an individual armour wire.
 */
export function fictitiousOverArmour(
  dBMm: number,
  armourWireDiaOrStripThicknessMm: number,
  pliableStranded = false,
): number {
  const tA = pliableStranded ? 3 * armourWireDiaOrStripThicknessMm : armourWireDiaOrStripThicknessMm;
  return roundToTenth(dBMm + 2 * tA);
}

/** One traced step of the fictitious chain, for provenance display. */
export interface FictitiousStep {
  label: string;
  valueMm: number;
  ref: string;
}

/**
 * Run the whole chain in order, capturing each rounded intermediate.
 *
 * Returned as a trace rather than a bare number because every one of these is a lookup key into a
 * downstream table, and when a GTP is questioned the reviewer needs to see which key was used at
 * each stage — not just the final figure.
 */
export function fictitiousChain(args: {
  csaSqMm: number;
  cores: number;
  insulationThicknessMm: number;
  flexibility?: CableFlexibility;
  screened?: boolean;
  oneLayer?: boolean;
  cradleSeparator?: boolean;
  /** Reduced-neutral cable: supply the half core's own insulation thickness and area. */
  halfCore?: { csaSqMm: number; insulationThicknessMm: number };
  innerSheathThicknessMm?: number;
  armour?: { wireDiaOrStripThicknessMm: number; pliableStranded?: boolean };
}): { steps: FictitiousStep[]; dLMm: number; dCMm: number; dFMm: number; dBMm?: number; dXMm?: number } {
  const steps: FictitiousStep[] = [];

  const dLMm = fictitiousConductorDiameter(args.csaSqMm, args.flexibility ?? "fixed");
  steps.push({
    label: `Fictitious conductor diameter (${args.csaSqMm} sq mm)`,
    valueMm: dLMm,
    ref: `IS 10462 (Part 1) : 1983, ${args.flexibility === "flexible" ? "Table 2" : "Table 1"}`,
  });

  const dCMm = fictitiousCoreDiameter({
    dLMm,
    insulationThicknessMm: args.insulationThicknessMm,
    screened: args.screened,
  });
  steps.push({ label: "Fictitious core diameter", valueMm: dCMm, ref: "IS 10462 (Part 1) : 1983, §3.2" });

  let dFMm: number;
  if (args.halfCore) {
    const halfDL = fictitiousConductorDiameter(args.halfCore.csaSqMm, args.flexibility ?? "fixed");
    const halfDC = fictitiousCoreDiameter({
      dLMm: halfDL,
      insulationThicknessMm: args.halfCore.insulationThicknessMm,
      screened: args.screened,
    });
    steps.push({
      label: `Fictitious core diameter, reduced neutral (${args.halfCore.csaSqMm} sq mm)`,
      valueMm: halfDC,
      ref: "IS 10462 (Part 1) : 1983, §3.2",
    });
    dFMm = fictitiousLaidUpDiameter({ form: "threeAndHalf", fullCoreDMm: dCMm, halfCoreDMm: halfDC });
    steps.push({ label: "Fictitious diameter over laid-up cores (3½ core)", valueMm: dFMm, ref: "IS 10462 (Part 1) : 1983, §3.3(b)" });
  } else if (args.cradleSeparator) {
    dFMm = fictitiousLaidUpDiameter({ form: "cradleSeparator", cores: args.cores, dCMm, oneLayer: args.oneLayer });
    steps.push({ label: "Fictitious diameter over laid-up cores (cradle separator)", valueMm: dFMm, ref: "IS 10462 (Part 1) : 1983, §3.3(c)" });
  } else {
    dFMm = fictitiousLaidUpDiameter({ form: "uniform", cores: args.cores, dCMm, oneLayer: args.oneLayer });
    steps.push({
      label: `Fictitious diameter over laid-up cores (k = ${assemblyCoefficient(args.cores, args.oneLayer ?? false)})`,
      valueMm: dFMm,
      ref: "IS 10462 (Part 1) : 1983, §3.3(a) + Table 3",
    });
  }

  if (args.innerSheathThicknessMm === undefined) return { steps, dLMm, dCMm, dFMm };

  const dBMm = fictitiousOverInnerSheath(dFMm, args.innerSheathThicknessMm);
  steps.push({ label: "Fictitious diameter over inner sheath (= under armour)", valueMm: dBMm, ref: "IS 10462 (Part 1) : 1983, §3.4" });

  if (!args.armour) return { steps, dLMm, dCMm, dFMm, dBMm };

  const dXMm = fictitiousOverArmour(dBMm, args.armour.wireDiaOrStripThicknessMm, args.armour.pliableStranded);
  steps.push({ label: "Fictitious diameter over armour", valueMm: dXMm, ref: "IS 10462 (Part 1) : 1983, §3.5" });

  return { steps, dLMm, dCMm, dFMm, dBMm, dXMm };
}

/** Sizes with an encoded Table 1 row — the closed set offerable for fixed-installation cables. */
export const IS10462_FIXED_SIZES = IS10462_TABLE1_FIXED.map((r) => r.csaSqMm);
