/**
 * Validation engine (PRD P0-5 / design-doc §1.3).
 *
 * Runs over the resolved field map + a few extra order facts. Two severities ONLY:
 *   • error   — an arithmetic contradiction; BLOCKS Generate.
 *   • warning — unusual but possible; needs acknowledgement.
 * Every message is plain language a non-engineer can act on.
 *
 * The headline rule is the golden-file demo: the approved KRYFS GTP's de-rating factors read
 * 1.22 → 1.25 → 1.16 → 1.09 → 1.10 → 0.9 — non-monotonic (transcription errors government
 * engineers approved). A form can't catch that; this engine must.
 */
import type { ResolvedField, ValidationIssue, ValidationResult } from "./types";

/** Extra facts the validator needs that aren't (all) in the field map. */
export interface ValidationContext {
  /** De-rating factors in temperature order (ascending temperature). Must be monotonically decreasing. */
  deratingFactors?: number[];
  /** Drum planned length (m) vs the ordered cable length (m) — must reconcile. */
  drumLengthM?: number;
  orderedLengthM?: number;
}

/** De-rating factors must fall as ambient temperature rises. */
function checkDeratingMonotonic(factors: number[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 1; i < factors.length; i++) {
    if (factors[i] > factors[i - 1]) {
      issues.push({
        id: `derating-${i}`,
        severity: "error",
        fieldKeys: ["derating"],
        rule: "derating.non-monotonic",
        message:
          `The de-rating factor at step ${i + 1} (${factors[i]}) is bigger than the one before it ` +
          `(${factors[i - 1]}). These numbers must go down as temperature goes up — one of them is a typo.`,
      });
    }
  }
  return issues;
}

/**
 * The drum plan must account for the ordered quantity (the handwritten-note bug on the real GTP).
 *
 * An order legitimately spans several drums, so this is NOT an equality check. What matters is
 * whether the ordered length divides evenly: a remainder means the last drum ships short, which is
 * exactly the situation that needs a human to confirm rather than silently pass.
 */
function checkDrumLength(drumLengthM: number, orderedLengthM: number): ValidationIssue[] {
  if (drumLengthM <= 0 || orderedLengthM <= 0) {
    return [
      {
        id: "drum-length-invalid",
        severity: "error",
        fieldKeys: ["drum.length"],
        rule: "drum.length-invalid",
        message: "Drum length and ordered length must both be greater than zero.",
      },
    ];
  }

  const fullDrums = Math.floor(orderedLengthM / drumLengthM);
  const remainder = orderedLengthM % drumLengthM;
  if (remainder === 0) return [];

  return [
    {
      id: "drum-length-remainder",
      severity: "warning",
      fieldKeys: ["drum.length"],
      rule: "drum.length-mismatch",
      message:
        `${orderedLengthM} m on ${drumLengthM} m drums leaves a part-drum: ` +
        `${fullDrums} full drum${fullDrums === 1 ? "" : "s"} plus ${remainder} m. ` +
        `Confirm the buyer accepts a short last drum.`,
    },
  ];
}

/**
 * Build-up reconciliation: the calculated dia-over-insulation must equal
 * compacted dia + 2 × insulation thickness. If the derivation produced a CALC field whose
 * stated arithmetic doesn't add up, that's an error (guards against a hand-overridden CALC).
 */
function checkBuildUp(fields: ResolvedField[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const compacted = numericMm(fields.find((f) => f.key === "power.compactedDia")?.value);
  const insulation = numericMm(fields.find((f) => f.key === "power.insulationThickness")?.value);
  const diaOver = numericMm(fields.find((f) => f.key === "power.diaOverInsulation")?.value);
  if (compacted != null && insulation != null && diaOver != null) {
    const expected = compacted + 2 * insulation;
    if (Math.abs(expected - diaOver) > 0.01) {
      issues.push({
        id: "buildup-dia",
        severity: "error",
        fieldKeys: ["power.diaOverInsulation", "power.compactedDia", "power.insulationThickness"],
        rule: "buildup.dia-mismatch",
        message:
          `Dia over insulation should be ${expected.toFixed(2)} mm ` +
          `(${compacted} + 2 × ${insulation}), but it reads ${diaOver.toFixed(2)} mm.`,
      });
    }
  }
  return issues;
}

/** Any field the engine couldn't source (gap) is a blocking error for a real GTP. */
function checkGaps(fields: ResolvedField[]): ValidationIssue[] {
  return fields
    .filter((f) => f.gap)
    .map((f) => ({
      id: `gap-${f.key}`,
      severity: "error" as const,
      fieldKeys: [f.key],
      rule: "field.missing-source",
      message: `"${f.label}" has no IS-table value yet. This must be filled before the GTP can be issued.`,
    }));
}

/** Pull the leading number out of a value like "12.44 mm" or "1.50 mm (Min)". */
function numericMm(value: string | number | undefined): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return value;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

export function validateGtp(fields: ResolvedField[], ctx: ValidationContext = {}): ValidationResult {
  const issues: ValidationIssue[] = [
    ...checkGaps(fields),
    ...checkBuildUp(fields),
    ...(ctx.deratingFactors ? checkDeratingMonotonic(ctx.deratingFactors) : []),
    ...(ctx.drumLengthM != null && ctx.orderedLengthM != null
      ? checkDrumLength(ctx.drumLengthM, ctx.orderedLengthM)
      : []),
  ];

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  return { issues, errorCount, warningCount, passesHardGate: errorCount === 0 };
}
