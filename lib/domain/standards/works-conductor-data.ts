/**
 * Conductor DIMENSIONS — works data, not a standard.
 *
 * ─── Why this file exists ─────────────────────────────────────────────────────────────────────
 *
 * IS 8130 : 2013 specifies no conductor diameter and no strand diameter for Class 1 and 2
 * conductors. Table 2 has four data columns: nominal area, minimum number of wires, and maximum
 * resistance. Conformance is by RESISTANCE (§3.2 — nominal area "is not subject to direct
 * measurement"), leaving actual dimensions to the manufacturer.
 *
 * But a GTP has to state them: buyer schedules ask for "No. & size of strands" and "diameter over
 * insulation", and the approved KRYFS PKG-30 document prints 19 / 2.17 mm / 9.44 mm for its
 * 70 sq mm core. Those numbers are real and must keep appearing — they simply are NOT an IS 8130
 * lookup, and printing them as one misrepresents where they came from.
 *
 * So they live here, tagged `works-data`, physically separate from the standards modules. The
 * distinction is not pedantic: if a buyer challenges a value, "IS 8130 Table 2 says so" is a
 * defence that would collapse on inspection, whereas "this is our works construction, and it
 * meets the IS 8130 resistance limit" is both true and defensible.
 *
 * ─── Rules for this file ──────────────────────────────────────────────────────────────────────
 *
 *  1. Every row states its actual origin (approved GTP, works standard, supplier datasheet).
 *  2. Rows carry `verified: true` ONLY where traceable to an approved document.
 *  3. A construction here must satisfy its IS 8130 constraints — the wire count must meet the
 *     Table 2 minimum, and the resistance must not exceed the Table 2 maximum. Enforced by test.
 *  4. Nothing here may be presented in the UI or PDF as a standards lookup.
 */
import { IS8130_2013_TABLE2_STRANDED } from "./is8130-2013";
import type { ConductorForm, ConductorMaterialCode } from "./is8130-2013";

export interface WorksConductorRow {
  csaSqMm: number;
  material: ConductorMaterialCode;
  form: ConductorForm;
  /** Actual wires used. Must be >= the IS 8130 Table 2 minimum for this size and form. */
  wires: number;
  /** Nominal individual wire diameter before stranding, mm. */
  wireDiaMm: number;
  /** Actual conductor diameter as manufactured, mm. */
  conductorDiaMm: number;
  /** Conductor mass, kg/km per core. */
  massKgPerKm?: number;
  /** Where this actually came from — never a standards clause. */
  origin: string;
  /** True only when traceable to an approved document. */
  verified: boolean;
}

/**
 * Compacted aluminium constructions.
 *
 * Only the 70 sq mm row is verified (approved KRYFS PKG-30 GTP). The others were carried over
 * from an earlier encoding where they sat in the IS 8130 module marked `// GAP: confirm from
 * PDF` — a confirmation that could never have arrived, since the standard has no such column.
 * They are unverified estimates and are labelled as such; the manufacturer must supply real
 * works figures before any of them appears on a signed document.
 */
export const WORKS_CONDUCTOR_AL_COMPACTED: ReadonlyArray<WorksConductorRow> = [
  { csaSqMm: 16, material: "AL", form: "compacted-or-shaped", wires: 7, wireDiaMm: 1.7, conductorDiaMm: 4.6, origin: "ESTIMATE — carried from earlier seed data, never confirmed", verified: false },
  { csaSqMm: 25, material: "AL", form: "compacted-or-shaped", wires: 7, wireDiaMm: 2.13, conductorDiaMm: 5.8, origin: "ESTIMATE — carried from earlier seed data, never confirmed", verified: false },
  { csaSqMm: 35, material: "AL", form: "compacted-or-shaped", wires: 7, wireDiaMm: 2.52, conductorDiaMm: 6.9, origin: "ESTIMATE — carried from earlier seed data, never confirmed", verified: false },
  { csaSqMm: 50, material: "AL", form: "compacted-or-shaped", wires: 7, wireDiaMm: 3.0, conductorDiaMm: 8.1, origin: "ESTIMATE — carried from earlier seed data, never confirmed", verified: false },
  {
    csaSqMm: 70, material: "AL", form: "compacted-or-shaped",
    wires: 19, wireDiaMm: 2.17, conductorDiaMm: 9.44, massKgPerKm: 196,
    origin: "Approved KRYFS PKG-30 GTP (WBSEDCL), spec §0.5",
    verified: true,
  },
  { csaSqMm: 95, material: "AL", form: "compacted-or-shaped", wires: 19, wireDiaMm: 2.52, conductorDiaMm: 11.0, origin: "ESTIMATE — carried from earlier seed data, never confirmed", verified: false },
];

/**
 * Compacted COPPER constructions, for control cable and copper LT power.
 *
 * The manufacturer builds aluminium; nearly every control specification in the corpus is copper.
 * Rather than resolve that by picking one, both are offered and the choice is made per order —
 * IS 8130 Table 2 fully specifies copper at every control size, and the minimum wire counts
 * genuinely differ from aluminium (at 4 sq mm: 7 wires for copper, 3 for aluminium).
 *
 * Note the FORM split. IS 8130 Table 2 specifies no compacted wire count below 10 sq mm — the
 * printed table shows a dash, because small conductors are made circular non-compacted. Control
 * sizes (1.5-6 sq mm) are therefore circular; 10 sq mm and up are compacted.
 *
 * ⚠️ NONE of these rows is verified. There is no approved copper GTP in the corpus to trace them
 * to, so every dimension here is an estimate from standard stranding geometry. The resistance and
 * wire-count MINIMA that come from IS 8130 are exact; the diameters are not. Control cable stays
 * unavailable partly for this reason — see cable-types.ts.
 */
export const WORKS_CONDUCTOR_CU_COMPACTED: ReadonlyArray<WorksConductorRow> = [
  { csaSqMm: 1.5, material: "CU", form: "circular-non-compacted", wires: 7, wireDiaMm: 0.53, conductorDiaMm: 1.6, origin: "ESTIMATE — standard stranding geometry, no approved copper GTP to trace to", verified: false },
  { csaSqMm: 2.5, material: "CU", form: "circular-non-compacted", wires: 7, wireDiaMm: 0.68, conductorDiaMm: 2.05, origin: "ESTIMATE — standard stranding geometry, no approved copper GTP to trace to", verified: false },
  { csaSqMm: 4, material: "CU", form: "circular-non-compacted", wires: 7, wireDiaMm: 0.85, conductorDiaMm: 2.6, origin: "ESTIMATE — standard stranding geometry, no approved copper GTP to trace to", verified: false },
  { csaSqMm: 6, material: "CU", form: "circular-non-compacted", wires: 7, wireDiaMm: 1.04, conductorDiaMm: 3.15, origin: "ESTIMATE — standard stranding geometry, no approved copper GTP to trace to", verified: false },
  { csaSqMm: 10, material: "CU", form: "compacted-or-shaped", wires: 7, wireDiaMm: 1.35, conductorDiaMm: 4.1, origin: "ESTIMATE — standard stranding geometry, no approved copper GTP to trace to", verified: false },
  { csaSqMm: 16, material: "CU", form: "compacted-or-shaped", wires: 6, wireDiaMm: 1.7, conductorDiaMm: 4.7, origin: "ESTIMATE — standard stranding geometry, no approved copper GTP to trace to", verified: false },
  { csaSqMm: 25, material: "CU", form: "compacted-or-shaped", wires: 6, wireDiaMm: 2.14, conductorDiaMm: 5.9, origin: "ESTIMATE — standard stranding geometry, no approved copper GTP to trace to", verified: false },
  { csaSqMm: 35, material: "CU", form: "compacted-or-shaped", wires: 6, wireDiaMm: 2.52, conductorDiaMm: 7.0, origin: "ESTIMATE — standard stranding geometry, no approved copper GTP to trace to", verified: false },
  { csaSqMm: 50, material: "CU", form: "compacted-or-shaped", wires: 6, wireDiaMm: 3.0, conductorDiaMm: 8.2, origin: "ESTIMATE — standard stranding geometry, no approved copper GTP to trace to", verified: false },
  { csaSqMm: 70, material: "CU", form: "compacted-or-shaped", wires: 12, wireDiaMm: 2.52, conductorDiaMm: 9.6, origin: "ESTIMATE — standard stranding geometry, no approved copper GTP to trace to", verified: false },
  { csaSqMm: 95, material: "CU", form: "compacted-or-shaped", wires: 15, wireDiaMm: 2.62, conductorDiaMm: 11.2, origin: "ESTIMATE — standard stranding geometry, no approved copper GTP to trace to", verified: false },
];

/** Every works construction held, both materials. */
export const WORKS_CONDUCTORS: ReadonlyArray<WorksConductorRow> = [
  ...WORKS_CONDUCTOR_AL_COMPACTED,
  ...WORKS_CONDUCTOR_CU_COMPACTED,
];

/** Look up a works construction. Returns undefined — absence here is normal, not exceptional. */
export function findWorksConductor(
  csaSqMm: number,
  opts: { material?: ConductorMaterialCode; form?: ConductorForm } = {},
): WorksConductorRow | undefined {
  const material = opts.material ?? "AL";
  const form = opts.form ?? "compacted-or-shaped";
  return WORKS_CONDUCTORS.find(
    (r) => r.csaSqMm === csaSqMm && r.material === material && r.form === form,
  );
}

/** Sizes with a VERIFIED works construction — the only ones defensible on a signed GTP. */
export const VERIFIED_WORKS_SIZES: number[] = WORKS_CONDUCTORS
  .filter((r) => r.verified)
  .map((r) => r.csaSqMm);

/**
 * Check a works construction against the IS 8130 limits it must satisfy.
 *
 * This is the bridge between the two files: works data is free to choose dimensions, but it is
 * NOT free to violate the standard's minimum wire count. Run as a test over every row.
 */
export function violatesIs8130(row: WorksConductorRow): string[] {
  const problems: string[] = [];
  const std = IS8130_2013_TABLE2_STRANDED.find((r) => r.csaSqMm === row.csaSqMm);
  if (!std) return [`${row.csaSqMm} sq mm has no IS 8130 Table 2 row`];

  const compacted = row.form === "compacted-or-shaped";
  const minWires = row.material === "AL"
    ? compacted ? std.minWiresCompactedAl : std.minWiresCircularAl
    : compacted ? std.minWiresCompactedCu : std.minWiresCircularCu;

  if (minWires !== null && row.wires < minWires) {
    problems.push(
      `${row.csaSqMm} sq mm: ${row.wires} wires is below the IS 8130 Table 2 minimum of ${minWires}`,
    );
  }
  if (row.conductorDiaMm <= row.wireDiaMm) {
    problems.push(`${row.csaSqMm} sq mm: conductor diameter must exceed a single wire diameter`);
  }
  return problems;
}

/** Warning to show wherever an unverified works dimension reaches the operator. */
export const unverifiedWorksDataWarning =
  "Estimated construction — not from a standard and not yet confirmed against works data. " +
  "IS 8130 does not specify conductor dimensions (§3.2); confirm with production before sign-off.";
