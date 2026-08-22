/**
 * GTP engine domain types (PRD §6 / design-doc §1.2).
 *
 * These are PURE domain types — no UI, no service imports beyond the shared cable vocab.
 * The engine pipeline is: size string → CableConstruction → ResolvedField[] → validation.
 * Every derived field carries its provenance (tag/source/trace) so the UI can show its working.
 */
import type { ConductorMaterial } from "@/lib/services/types";

/** Which of the five kinds a GTP field is. Drives whether it's editable and how it's sourced. */
export type FieldTag = "LOOKUP" | "CALC" | "CHOICE" | "QUIRK" | "FIXED";

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
