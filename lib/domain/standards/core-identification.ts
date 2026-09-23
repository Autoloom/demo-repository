/**
 * Core identification — shared by IS 7098 (Part 1) and IS 1554 (Part 1).
 *
 * ─── Why one module, like protective-coverings ────────────────────────────────────────────────
 *
 * Both standards print the same scheme, clause for clause:
 *
 *   IS 7098-1 §11.1(b) / IS 1554-1 §10.1   colouring of insulation, 1 to 6+ cores
 *   IS 7098-1 §11.2    / IS 1554-1 §10.2   reduced neutral shall be black
 *   IS 7098-1 §11.3    / IS 1554-1 §10.3   numbering, as an alternative above 5 cores
 *
 * Encoding it twice would make two sources of truth for one table, so it lives here once and
 * each cable standard cites its own clause numbering through `clauseFor`.
 *
 * ─── Why it is derived and not a customer quirk ───────────────────────────────────────────────
 *
 * It was previously only reachable as a `quirks.coreIdentification` string off a customer
 * profile, which meant a GTP for a customer without a profile printed nothing at all for a
 * particular an inspector checks against the drum. It is a table lookup on core count — so it
 * is derived, with provenance, and a customer profile may still override it.
 *
 * ─── One recorded disagreement ────────────────────────────────────────────────────────────────
 *
 * The manufacturer's Sept 2026 review gives 3 core as "Red / Yellow / Black". Both standards
 * give red, yellow and BLUE, reserving black for the neutral — and the same review's 3½ core
 * answer (R/Y/Blue + Black neutral) is consistent with the standard, so "Black" on 3 core reads
 * as a slip for "Blue". The standard is encoded here; the disagreement is carried in
 * `CORE_IDENTIFICATION_OPEN_QUESTION` rather than silently resolved either way. If the customer
 * confirms R/Y/Black is a genuine order requirement it belongs on the GTP as a recorded
 * deviation — which is what the profile override is for.
 */

export type CoreColour = "Red" | "Yellow" | "Blue" | "Black" | "Grey" | "Natural";

export type IdentificationMethod = "colour" | "numbered";

export interface CoreIdentification {
  method: IdentificationMethod;
  /** Full-size cores in printed order. Empty when numbered. */
  colours: CoreColour[];
  /** Reduced neutral's colour — only 3½ core has one. Black by rule. */
  reducedNeutralColour?: CoreColour;
  /** Exactly what the GTP row should read. */
  printed: string;
  /** Clause citation for the trace. */
  ref: string;
  /** The alternative the standard also permits, when there is one. */
  alternative?: string;
}

/** Both standards print the same scheme; only the clause numbering differs. */
export type IdentificationStandard = "IS7098-1" | "IS1554-1";

const CLAUSE: Record<IdentificationStandard, { book: string; edition: string; colour: string; neutral: string; numbered: string }> = {
  "IS7098-1": { book: "IS 7098 (Part 1)", edition: "2025", colour: "§11.1(b)", neutral: "§11.2", numbered: "§11.3" },
  "IS1554-1": { book: "IS 1554 (Part 1)", edition: "1988", colour: "§10.1", neutral: "§10.2", numbered: "§10.3" },
};

function clauseFor(standard: IdentificationStandard, which: "colour" | "neutral" | "numbered"): string {
  const c = CLAUSE[standard];
  return `${c.book} : ${c.edition}, ${c[which]}`;
}

/** The colour sequence by full-core count, 1 to 5. Above that the standards switch approach. */
const COLOUR_SEQUENCE: Record<number, CoreColour[]> = {
  2: ["Red", "Black"],
  3: ["Red", "Yellow", "Blue"],
  4: ["Red", "Yellow", "Blue", "Black"],
  5: ["Red", "Yellow", "Blue", "Black", "Grey"],
};

/** Single core: the standard offers a choice rather than fixing one colour. */
const SINGLE_CORE_CHOICE: CoreColour[] = ["Red", "Black", "Yellow", "Blue", "Natural"];

/**
 * Core identification for a core count.
 *
 * `coreCount` is the registry's own value, so 3.5 means three full cores plus a reduced neutral.
 * Pure lookup — a count the standard handles by numbering comes back as `numbered`, because
 * inventing a 27-colour sequence would be fiction.
 */
export function coreIdentification(
  standard: IdentificationStandard,
  coreCount: number,
): CoreIdentification {
  // ── 3½ core — phases by colour, reduced neutral black by rule ──
  if (coreCount === 3.5) {
    return {
      method: "colour",
      colours: ["Red", "Yellow", "Blue"],
      reducedNeutralColour: "Black",
      printed: "Red / Yellow / Blue (phases), Black (reduced neutral)",
      ref: `${clauseFor(standard, "colour")}; reduced neutral ${clauseFor(standard, "neutral")}`,
    };
  }

  if (coreCount === 1) {
    return {
      method: "colour",
      colours: SINGLE_CORE_CHOICE,
      printed: `${SINGLE_CORE_CHOICE.join(", ")} — any one, as ordered`,
      ref: clauseFor(standard, "colour"),
    };
  }

  const sequence = COLOUR_SEQUENCE[coreCount];
  if (sequence) {
    return {
      method: "colour",
      colours: sequence,
      printed: sequence.join(" / "),
      ref: clauseFor(standard, "colour"),
    };
  }

  // ── Above 5 cores — numbered. This is the control-cable answer. ──
  return {
    method: "numbered",
    colours: [],
    printed:
      `Cores numbered 1 to ${coreCount}; numerals repeated at intervals not exceeding 50 mm, ` +
      "consecutive numbers inverted relative to each other, insulation of all cores one colour",
    ref: clauseFor(standard, "numbered"),
    alternative:
      `Alternatively per ${clauseFor(standard, "colour")}: two adjacent cores (counting and ` +
      "direction core) in each layer blue and yellow, remaining cores grey.",
  };
}

/**
 * Open question with the manufacturer, carried rather than resolved. Surfaced in the builder so
 * it reaches a human instead of sitting in a comment.
 */
export const CORE_IDENTIFICATION_OPEN_QUESTION = {
  subject: "3 core identification",
  ours: "Red / Yellow / Blue",
  theirs: "Red / Yellow / Black",
  note:
    "Sept 2026 review asks for Red/Yellow/Black on 3 core. IS 1554-1 §10.1(c) and IS 7098-1 " +
    "§11.1(b) both give Red/Yellow/Blue, with black reserved for the neutral — and the same " +
    "review's 3½ core answer follows the standard. Encoded to the standard pending confirmation; " +
    "if R/Y/Black is a genuine order requirement, record it as a customer deviation.",
} as const;
