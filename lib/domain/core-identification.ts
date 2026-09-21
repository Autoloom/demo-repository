/**
 * Core identification — which core is which, and how you tell them apart.
 *
 * WHY THIS EXISTS
 * A GTP has to state core identification: an inspector checks the colours on the drum
 * against the approved document. Until now the armoured families carried no concept of
 * it at all, so every GTP we produced was silent on a particular the customer checks.
 * Client feedback (Laxmikant Shete, Daksha Cable, Sept 2026) called this out on both
 * LT XLPE and control cable.
 *
 * SOURCE OF TRUTH — the scheme is NOT ours to choose
 * Both governing standards print the same table, so this is a lookup, not a judgement:
 *   IS 1554 (Part 1) - 1988, cl. 10.1   (PVC insulated — LT PVC power, control)
 *   IS 7098 (Part 1) - 1988, cl. 10.1(b) (XLPE insulated — LT XLPE)
 *
 *     1 core  : red, black, yellow, blue or natural (any one)
 *     2 cores : red, black
 *     3 cores : red, yellow, blue
 *     4 cores : red, yellow, blue, black
 *     5 cores : red, yellow, blue, black, grey
 *     6+      : two adjacent cores blue and yellow, remainder grey — or numbered
 *
 * And the rule that makes 3.5 core work, stated separately in both standards:
 *   IS 1554 cl. 10.2 / IS 7098 cl. 10.2 — "For reduced neutral conductors, the
 *   insulation colour shall be black."
 *   IS 7098 cl. 10, NOTE 1 — "red, yellow and blue colours shall be used to identify
 *   the phase conductors, and black to identify reduced neutral conductor."
 *
 * So 3.5 core = Red / Yellow / Blue + Black neutral, straight from the standard.
 *
 * ⚠️ ONE POINT OF DISAGREEMENT WITH THE FEEDBACK — deliberately not silently applied.
 * The feedback gives 3 core as "Red / Yellow / Black". Both standards give 3 core as
 * red, yellow and BLUE; black is reserved for the neutral (4 core adds black as the
 * fourth, and the reduced neutral of a 3.5 core is black). Reading "Black" as a slip
 * for "Blue" makes the whole list self-consistent with the 3.5 core answer in the same
 * message. We follow the standard and flag it — see `IS_DEVIATION_NOTES`. If the
 * customer genuinely wants R/Y/Black on 3 core, that is a customer-specific deviation
 * and belongs in the GTP as such, not baked in here as if it were the standard.
 */

import type { CableStandard, CoreConfig } from "@/lib/services/types";

export type CoreColour = "Red" | "Yellow" | "Blue" | "Black" | "Grey" | "Natural";

export type IdentificationMethod =
  /** Coloured insulation (or a coloured strip on the core). */
  | "Colour"
  /** Numerals printed on identically-coloured cores — the multicore/control answer. */
  | "Numbered";

export interface CoreIdentification {
  method: IdentificationMethod;
  /** Phase/main cores in printed order. Empty when the method is Numbered. */
  phaseColours: CoreColour[];
  /** The reduced neutral's colour — only 3.5 core has one. Always black per cl. 10.2. */
  reducedNeutralColour?: CoreColour;
  /** Exactly what the GTP row should read. */
  printed: string;
  /** Clause citation, so an inspector can check us against the book. */
  clause: string;
  note?: string;
}

/** Which standard's clause numbering to cite. Both print the same scheme. */
function clauseFor(standard: CableStandard | undefined, sub: string): string {
  const book =
    standard === "IS 7098-1" || standard === "IS 7098-2"
      ? "IS 7098 (Part 1) - 1988"
      : "IS 1554 (Part 1) - 1988";
  return `${book} cl. ${sub}`;
}

/** Full-size cores a config carries, excluding the 3.5 core's reduced neutral. */
function phaseCoreCount(cores: CoreConfig): number {
  if (cores === "3.5C") return 3;
  return Number.parseInt(cores, 10);
}

/** The standards' colour sequence for 1–5 cores. Index = core count. */
const COLOUR_SEQUENCE: Record<number, CoreColour[]> = {
  2: ["Red", "Black"],
  3: ["Red", "Yellow", "Blue"],
  4: ["Red", "Yellow", "Blue", "Black"],
  5: ["Red", "Yellow", "Blue", "Black", "Grey"],
};

/**
 * Resolve core identification for an armoured-family spec.
 *
 * Pure lookup against the standard — no interpolation, no house style. A config the
 * standard handles by numbering comes back as `Numbered`, because inventing a
 * 27-colour sequence would be fiction.
 */
export function coreIdentification(
  cores: CoreConfig,
  standard?: CableStandard,
): CoreIdentification {
  // ── 3.5 core — phases by colour, reduced neutral black (cl. 10.2) ──
  if (cores === "3.5C") {
    return {
      method: "Colour",
      phaseColours: ["Red", "Yellow", "Blue"],
      reducedNeutralColour: "Black",
      printed: "Red / Yellow / Blue (phases) + Black (reduced neutral)",
      clause: `${clauseFor(standard, "10.1")}, cl. 10.2`,
      note: "Reduced neutral is black by rule — cl. 10.2.",
    };
  }

  // ── Single core — the standard offers a choice rather than fixing one ──
  if (cores === "1C") {
    return {
      method: "Colour",
      phaseColours: ["Red"],
      printed: "Red, black, yellow, blue or natural (any one, to be stated per order)",
      clause: clauseFor(standard, "10.1"),
      note: "The standard permits any one of these for a single core; the order decides.",
    };
  }

  const n = phaseCoreCount(cores);
  const sequence = COLOUR_SEQUENCE[n];

  // ── 2–5 cores — a fixed colour sequence ──
  if (sequence) {
    return {
      method: "Colour",
      phaseColours: sequence,
      printed: sequence.join(" / "),
      clause: clauseFor(standard, "10.1"),
    };
  }

  // ── 6 cores and above — numbered (cl. 10.3). This is the control-cable answer. ──
  return {
    method: "Numbered",
    phaseColours: [],
    printed:
      `Cores numbered 1 to ${n}, numerals printed at intervals not exceeding 50 mm, ` +
      "consecutive numbers inverted relative to each other; insulation of all cores the same colour",
    clause: clauseFor(standard, "10.3"),
    note:
      "Alternatively, per cl. 10.1: two adjacent cores (counting and direction core) in each " +
      "layer blue and yellow, remaining cores grey.",
  };
}

/**
 * Deviations between the customer's stated preference and the standard, kept visible
 * rather than resolved in silence. Surfaced in the UI so Sales raises it with the
 * customer instead of discovering it at inspection.
 */
export const IS_DEVIATION_NOTES: readonly { subject: string; note: string }[] = [
  {
    subject: "3 core identification",
    note:
      "Customer feedback (Sept 2026) gives 3 core as Red / Yellow / Black. " +
      "IS 1554 (Part 1) cl. 10.1(c) and IS 7098 (Part 1) cl. 10.1(b) both give " +
      "Red / Yellow / Blue, with black reserved for the neutral. We follow the standard " +
      "here — confirm with the customer whether R/Y/Black is a genuine order-specific " +
      "requirement, in which case it is recorded as a deviation on the GTP.",
  },
] as const;
