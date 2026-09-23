/**
 * GTP engine domain types (PRD §6 / design-doc §1.2).
 *
 * These are PURE domain types — no UI, no service imports beyond the shared cable vocab.
 * The engine pipeline is: size string → CableConstruction → ResolvedField[] → validation.
 * Every derived field carries its provenance (tag/source/trace) so the UI can show its working.
 */
import type { ConductorMaterial } from "@/lib/services/types";

/** Which of the five kinds a GTP field is. Drives whether it's editable and how it's sourced. */
/**
 * Where a field's VALUE came from, as printed next to it in the builder.
 *
 * MANUAL is deliberately distinct from the rest: every other tag traces to a standard, a
 * customer profile or a calculation the engine can re-check, whereas MANUAL means a person
 * typed it and nothing verifies it. Keeping it a separate tag rather than reusing CHOICE stops
 * hand-entered text being mistaken for something the engine stands behind.
 */
export type FieldTag = "LOOKUP" | "CALC" | "CHOICE" | "QUIRK" | "FIXED" | "MANUAL";

/** Where a resolved value came from, most-specific-wins cascade (design-doc §0.3). */
/**
 * Where a field's value came from.
 *
 * `works-data` is distinct from `is-table` on purpose. Some values a GTP must state are simply
 * not in any standard — IS 8130 specifies no conductor dimensions at all (§3.2), yet buyer
 * schedules ask for strand count and conductor diameter. Those come from works construction data.
 * Labelling them `is-table` would be a provenance claim that collapses under inspection.
 */
export type FieldSource = "is-table" | "works-data" | "profile" | "order" | "override" | "calc";

/**
 * Cable types in scope (build-plan-v2 D5), in build order. Screened and instrumentation cables
 * are deliberately absent — the manufacturer does not make them.
 * The authoritative definitions live in cable-types.ts.
 */
export type ProductLine = "AB_CABLE" | "XLPE_POWER" | "PVC_CONTROL" | "SOLAR_DC";

/**
 * A single conductor group within a cable construction, e.g. "3 power cores @ 70 sq mm".
 * `role` distinguishes the physical purpose so derivation and rendering can treat them right.
 */
export interface ConductorGroup {
  role: "power" | "messenger" | "street-light" | "neutral" | "control";
  count: number;
  sizeSqMm: number;
  /** Filled by derivation from the standard; not required at parse time. */
  material?: ConductorMaterial;
}

/**
 * The canonical parsed cable, e.g. `3Cx70 + 1Cx50 + 1Cx16`.
 * This is the single object every downstream document (GTP, drum marking, job ticket) renders from.
 */
export interface CableConstruction {
  productLine: ProductLine;
  groups: ConductorGroup[];
  /** The exact string the user typed, preserved for audit and re-parse. */
  raw: string;
}

/**
 * Where a tolerance came from — and why this is NOT `FieldSource`.
 *
 * `FieldSource` answers "which layer of the cascade produced this value". This answers a
 * different question that matters to an inspector: is the permitted departure a STANDARDS
 * ACCEPTANCE LIMIT, our own manufacturing spread, or a commercial term the buyer negotiated?
 *
 * The distinction is load-bearing. `power.massPerKm` carries ±3% because that is the spread our
 * works actually holds; IS 14255 says nothing about mass tolerance at all. Presenting that ±3%
 * in the same voice as an IS §7.3 insulation floor would invite an inspector to reject a drum
 * for breaching a limit no standard imposes.
 */
export type ToleranceOrigin = "is-rule" | "works-estimate" | "customer" | "manual" | "not-applicable";

/** What prints when a parameter has no meaningful tolerance. */
export const TOLERANCE_NA = "N/A";

/**
 * The permitted departure from a field's nominal value.
 *
 * ─── Every field has one; a blank is never an answer ──────────────────────────────────────────
 *
 * This is a MANDATORY input. Where no standard specifies a tolerance the engine supplies
 * `not-applicable`, which prints as "N/A" — an explicit statement that the parameter has no
 * meaningful tolerance, not an empty cell.
 *
 * The distinction matters on a document that gets stamped. An empty cell is ambiguous between
 * "no tolerance applies here" and "nobody filled this in", and a buyer's inspector cannot tell
 * which. "N/A" says a person considered the question and answered it.
 *
 * Most parameters legitimately resolve to N/A: conductor resistance is already a maximum
 * (IS 8130 §3.2), overall diameter is explicitly informational (IS 17293 Tables 1/2). The engine
 * still never INVENTS a numeric tolerance — N/A is an answer, not a guess.
 *
 * Never emit `{ value: "" }`. If there is nothing to state, that is `not-applicable`.
 */
export interface FieldTolerance {
  /** Exact published floor, retained separately from rounded display percentages. */
  floorMm?: number;
  /** Printed text, e.g. "min 1.25 mm" or "±3%". */
  value: string;
  origin: ToleranceOrigin;
  /** Clause citation for `is-rule`; the working for `works-estimate`; profile for `customer`. */
  trace: string;
  /**
   * Set only when a person typed over a derived tolerance. `previousOrigin` is kept because by
   * the time the UI checks whether a reason was required, `origin` has already become "manual".
   */
  override?: {
    previous: string;
    previousOrigin: ToleranceOrigin;
    reason: string;
    by: string;
    at: string;
  };
}

/** A field after resolution through the three-layer cascade. */
export interface ResolvedField {
  key: string; // canonical dictionary key, e.g. "power.strands"
  label: string; // human label, e.g. "No. of strands"
  value: string | number;
  tag: FieldTag;
  source: FieldSource;
  trace: string; // e.g. "IS 8130:2013, Table 2, 70 sq mm Class 2"
  /** LOOKUP/CALC are locked by default; CHOICE/QUIRK are editable. */
  editable: boolean;
  /** Set only when a user overrode a locked value (two actions + a reason). */
  override?: { previous: string | number; reason: string; by: string; at: string };
  /** Flag values the engine couldn't source yet — surfaced in UI and blocks a real GTP. */
  gap?: boolean;
  /**
   * The permitted departure from this value — a mandatory input on every field.
   *
   * Optional in the TYPE only so that engines can build a field literal without it and have
   * `withMandatoryTolerance()` fill in N/A; every field that leaves an engine has one. Reading
   * code should treat it as always present.
   *
   * Mirrored on `GtpDerivedField` in lib/services/types.ts. Keep the two in step: `derivedFields`
   * is assigned from a variable, not a literal, so TypeScript's excess-property check does NOT
   * fire and an unmirrored member is silently dropped from every saved record.
   */
  tolerance?: FieldTolerance;
}

// ── Validation ────────────────────────────────────────────────────────────────

/** Two severities only (design-doc §1.3) — nuance is the enemy of a simple review screen. */
export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  id: string;
  severity: IssueSeverity; // error blocks Generate; warning needs acknowledgement
  /** Which resolved field(s) this issue points at, so the UI can scroll to them. */
  fieldKeys: string[];
  /** Plain-language explanation a non-engineer can act on. */
  message: string;
  /** Short machine code for the rule that fired, e.g. "derating.non-monotonic". */
  rule: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  /** True when there are zero errors (warnings may still need acknowledgement in the UI). */
  passesHardGate: boolean;
}

// ── Parse result ──────────────────────────────────────────────────────────────

/**
 * Parsing never throws. On success it returns the construction plus a plain-language
 * playback; on failure it returns a suggestion state (never a bare "invalid input").
 */
export type ParseResult =
  | { ok: true; construction: CableConstruction; playback: string }
  | { ok: false; reason: string; suggestions: string[] };

/**
 * Field keys that are INPUTS to a derivation chain rather than outputs of it.
 *
 * Overriding one of these is not an edit — it is a different cable. The override mechanism
 * replaces a field's printed value without re-running the chain, so changing "Nominal conductor
 * area" from 120 to 260 here left the insulation at 1.20 mm, the diameter under the outer sheath
 * at 36.30 mm and the mass at 2421 kg/km: every dimension still describing the 120 sq mm cable,
 * on a sheet that now says 260. The document contradicted itself and nothing said so.
 *
 * Re-deriving from the overridden value is not the fix either: 260 sq mm has no row in
 * IS 10462 Table 1 or IS 8130 Table 2, so the chain cannot produce dimensions for it at all.
 * That is what the construction picker's closed option set exists to prevent.
 *
 * So an override on one of these blocks generation and says to use the picker instead.
 */
export const CHAIN_INPUT_FIELD_KEYS: readonly string[] = [
  "cable.size",
  "cable.cores",
  "cable.material",
  "cable.standard",
];

/** Operator-facing reason an input field must not be overridden on the sheet. */
export function chainInputOverrideMessage(label: string): string {
  return (
    `"${label}" is an input to the dimensional build-up, not a result of it. Change it in the ` +
    "construction picker above so the insulation, sheath, armour and mass recalculate — " +
    "overriding it here would leave every dimension describing the previous cable."
  );
}

/**
 * Fields derived and stored, but off the printed sheet unless an operator turns them back on.
 *
 * Armour thickness and width are each a traced chain step, and the spec bridge checks both
 * against the chain — so they must stay in `fields`. They should not each be a ROW on the
 * document though: the client asked for one "armour wire size" field, because that is how a
 * buyer writes it ("4 × 0.8 mm"), not a thickness and a width on separate lines. `lt.armourSize`
 * prints the pair with its provenance; these two stay available behind the show/hide control for
 * anyone who wants the full build-up.
 */
export const DEFAULT_HIDDEN_FIELD_KEYS: readonly string[] = ["lt.armour", "lt.armour.width"];
