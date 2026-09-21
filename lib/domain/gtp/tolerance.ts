/**
 * Tolerance formatting.
 *
 * ─── Why the phrasing is centralised but the RULES are not ────────────────────────────────────
 *
 * Four standards specify a minimum-thickness tolerance, and three of them use genuinely
 * different arithmetic:
 *
 *   IS 14255 §7.3   insulation   t − (0.1 + 0.1 · t)
 *   IS 7098-1 §10.3 insulation   t − (0.1 + 0.1 · t)
 *   IS 1554-1 §9.3  insulation   t − (0.1 + 0.1 · t)
 *   IS 17293 §5.3   insulation   t − (0.1 + 0.1 · t)
 *   IS 17293 §6.3   SHEATH       t − (0.1 + 0.15 · t)   ← 0.15, not 0.1
 *   IEC 62930 §5.2.3             0.9 · t − 0.1
 *   EN 50618 §5.3.3  sheath      0.85 · t − 0.1
 *
 * Those formulas stay in their own standards modules, where each sits next to the clause it
 * encodes and can be checked against the PDF. This module only decides how the RESULT is worded,
 * so a reader comparing two cable types sees one phrasing rather than three.
 *
 * The temptation this file is designed to resist: noticing that four of the seven rules look
 * identical and "simplifying" them into one shared function. IS 17293 is the proof that would be
 * wrong — its insulation and sheath clauses differ by a single coefficient, and collapsing them
 * would silently widen every solar sheath tolerance by 50%.
 *
 * ─── On the printed form ──────────────────────────────────────────────────────────────────────
 *
 * Tolerances print as percentage deviations, the way an engineering drawing states them:
 *
 *   −16.7%   a one-sided limit  (thickness floors — the standards set no upper bound)
 *   ±3%      a symmetric band   (mass, drum length — these genuinely vary both ways)
 *
 * The sign carries the meaning, so the two cases must not be conflated. See `floorTolerance`.
 * The absolute millimetre limit lives in each field's `trace`, which the builder shows and the
 * customer document does not print.
 */
import { TOLERANCE_NA } from "./types";
import type { FieldTolerance, ResolvedField, ToleranceOrigin } from "./types";

/** Percentages print to one decimal — 16.7%, not 16.67% or 17%. */
const pct = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

/**
 * A minimum-thickness limit derived from a standard, expressed as a unilateral deviation.
 *
 * ─── Why this is "−16.7%" and never "±16.7%" ──────────────────────────────────────────────────
 *
 * The IS thickness clauses set a FLOOR and nothing else. IS 14255 §7.3, IS 7098-1 §10.3,
 * IS 1554-1 §9.3 and IS 17293 §5.3/§6.3 all say the smallest measured value shall not fall below
 * a computed minimum. None of them caps the thickness from above — a wall thicker than nominal
 * is conforming (and, for the buyer, free copper-equivalent).
 *
 * So a "±" here would invent an upper limit the standard does not impose, and on a document that
 * an inspector accepts or rejects drums against. The minus-only form is the standard engineering
 * notation for exactly this situation, and it says what the clause says.
 *
 * ─── Why a percentage at all ──────────────────────────────────────────────────────────────────
 *
 * The underlying rule is absolute (`t − (0.1 + 0.1·t)`), so the equivalent percentage is not a
 * constant: it runs from −24.3% at 0.70 mm to −12.5% at 4.00 mm, because the fixed 0.1 mm term
 * dominates at small thicknesses. Each row therefore carries its own figure, computed from its
 * own nominal — never a single blanket percentage applied across sizes.
 *
 * The absolute floor in millimetres stays in `trace`. An inspector measures millimetres, so that
 * number must remain recoverable; it is one click away in the builder rather than on the page.
 */
export function floorTolerance(nominalMm: number, floorMm: number, trace: string): FieldTolerance {
  // Guard against a zero nominal producing Infinity — no encoded row has one, but a future
  // table might, and a tolerance reading "−Infinity%" would reach the PDF unnoticed.
  const deviation = nominalMm > 0 ? (nominalMm - floorMm) / nominalMm : 0;
  return {
    value: `−${pct(deviation)}`,
    origin: "is-rule",
    floorMm,
    // The clause and the arithmetic are the caller's; the resolved floor is appended here so
    // every is-rule trace carries the millimetre figure without each engine repeating itself.
    trace: `${trace} = ${floorMm.toFixed(2)} mm min at any point`,
  };
}

/**
 * A symmetric band, e.g. "±3%" — the ± is correct here because these genuinely cut both ways.
 *
 * A drum may be over or under its nominal length; a mass estimate may be high or low. That is
 * what distinguishes these from the thickness floors above, and why they are the only tolerances
 * in the system that use the ± sign.
 *
 * Deliberately requires an explicit `origin`: every band currently in the system is either a
 * works estimate or a commercial term, and none is a standards limit. Defaulting this argument
 * would make it one keystroke to mislabel a manufacturing spread as an IS acceptance criterion.
 */
export function bandTolerance(
  band: string,
  origin: Exclude<ToleranceOrigin, "is-rule" | "not-applicable">,
  trace: string,
): FieldTolerance {
  return { value: band, origin, trace };
}

/**
 * "No tolerance applies to this parameter" — an answer, not an omission.
 *
 * `why` is required and becomes the trace, because "N/A" without a reason is indistinguishable
 * from a field nobody looked at. The reasons are real and specific: a conductor resistance is
 * already a maximum, an overall diameter is published for information only, a marking legend is
 * text rather than a measurement.
 */
export function notApplicable(why: string): FieldTolerance {
  return { value: TOLERANCE_NA, origin: "not-applicable", trace: why };
}

/**
 * A tolerance an operator typed on a hand-added parameter.
 *
 * Stored verbatim. Unlike every other constructor here there is no rule behind it to normalise
 * against — a buyer's clause may state a band ("±2%"), a class ("Class B"), or a bare limit — so
 * imposing the sign convention that governs derived tolerances would be inventing a meaning the
 * operator did not write.
 *
 * `origin` is `manual`, never `customer`. The distinction is the one T1.3 drew for values: an
 * operator transcribing a clause is not the same as the board mandating it, and nothing on this
 * row records which happened. `manual` claims the least.
 *
 * Blank returns N/A with its OWN reason rather than the generic engine default, so the trail
 * distinguishes "a person left this unstated" from "the engine had nothing to say".
 */
export function manualTolerance(typed: string): FieldTolerance {
  const value = typed.trim();
  if (!value) {
    return notApplicable("No tolerance was stated for this hand-added parameter");
  }
  return { value, origin: "manual", trace: "Entered manually — not derived from any standard" };
}

/**
 * Guarantee the mandatory-input rule at the engine boundary.
 *
 * Applied once to each engine's finished list rather than to every field literal: there are
 * ~90 field definitions across the three engines and most take the default, so requiring an
 * explicit tolerance at each one would be noise that hides the handful that matter.
 *
 * The default reason is deliberately generic. Where a parameter has an INTERESTING reason for
 * having no tolerance — resistance being a maximum, diameter being indicative — the engine says
 * so explicitly with `notApplicable(...)` and this function leaves it alone.
 */
export function withMandatoryTolerance(fields: ResolvedField[]): ResolvedField[] {
  return fields.map((f) =>
    f.tolerance
      ? f
      : { ...f, tolerance: notApplicable("No tolerance applies to this parameter") },
  );
}
