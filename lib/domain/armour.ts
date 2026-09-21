/**
 * Armour — geometry, and the weight that follows from it.
 *
 * WHY THIS EXISTS
 * `ArmourType` used to be a bare label ("GI strip (GSS)") with no dimensions, and
 * costing priced armour as `conductorSize × 0.0016` — a coefficient keyed to the
 * CONDUCTOR, which is the one thing armour weight does not depend on. Armour wraps the
 * outside of the cable, so its weight is a function of the diameter it is applied over
 * and the size of the wire or strip, not of the copper in the middle.
 *
 * That made the client's request impossible to express: "use 4 × 0.8 mm galvanised
 * steel strip instead of wire armour on 3.5 core — the dimensions and weight change
 * accordingly" (Laxmikant Shete, Daksha Cable, Sept 2026). Under the old model,
 * switching wire → strip changed nothing at all: same coefficient, same weight.
 *
 * WHAT THE STANDARDS FIX, AND WHAT THEY LEAVE OPEN
 *   IS 7098 (Part 1) cl. 13.2 / IS 1554 (Part 1) cl. 13.2 — where the calculated
 *   diameter under armour is ≤ 13 mm the armour SHALL be galvanised round steel wire;
 *   above 13 mm it may be round wire OR galvanised steel strip. So strip is not a free
 *   choice on small cables, and `checkArmourPermitted()` enforces that.
 *
 *   IS 7098 (Part 1) Table 6 / IS 1554 (Part 1) Table 5 — nominal thickness of steel
 *   strip is 0.8 mm. The client's "4 × 0.8 mm" is therefore the standard thickness at
 *   the common 4 mm commercial width.
 *
 * THE WEIGHT IS DERIVED, NOT TABULATED
 * No approved weight table has been transcribed for these families yet (see
 * `families.ts` → `blockedOn`), so rather than keep a made-up coefficient we compute
 * the steel cross-section from the actual geometry:
 *
 *   Strip:      strips are laid side by side around the circumference, so the number of
 *               strips is ≈ π(D + t) / w and the total steel area is
 *                   n × w × t  =  π (D + t) t
 *               — which cancels the width. Two different widths at the same thickness
 *               weigh the same, which is the physically right answer and the reason the
 *               standard fixes thickness rather than width.
 *
 *   Round wire: n ≈ π(D + d) / d wires of area πd²/4 each.
 *
 *   Mass:       1 mm² of steel over 1 m is 1 cm³ ≈ 7.85 g, so kg/m = area(mm²) × 0.00785.
 *
 * This is a calculation, not an approved figure, and it is labelled that way everywhere
 * it surfaces. It replaces a coefficient that was wrong in kind, not merely in value.
 */

import type { ArmourType } from "@/lib/services/types";

/** Density of steel, expressed as kg per metre per mm² of cross-section. */
export const STEEL_KG_PER_M_PER_SQMM = 0.00785;

/**
 * Below this calculated diameter under armour, the standards require round wire.
 * IS 7098 (Part 1) cl. 13.2 and IS 1554 (Part 1) cl. 13.2.
 */
export const STRIP_ARMOUR_MIN_DIA_MM = 13;

/**
 * IS 7098 (Part 1) Table 6 prints TWO accepted methods of applying armour, and the note
 * under it says so explicitly: "(a) and (b) indicate two methods of practice in the
 * application of armouring."
 *
 *   (a) 0.8 mm strip at ALL diameters in excess of 13 mm — one strip size for the range.
 *   (b) a banded selection that steps up to 1.4 mm strip above 40 mm.
 *
 * This matters commercially: the client's "4 × 0.8 mm ... very widely used" is method
 * (a), and under method (a) it is correct at every size above 13 mm, including the large
 * 3.5 core sizes where method (b) would call for 6.1 × 1.4. Both are standard-compliant.
 * We default to (a) because that is the stated practice, and offer (b) as the choice.
 */
export type ArmourMethod = "a" | "b";

/** Nominal strip thickness under method (a) — 0.8 mm at all diameters above 13 mm. */
export const STANDARD_STRIP_THICKNESS_MM = 0.8;

/**
 * The two strip sizes IS 7098 (Part 1) actually names. Table 7 tabulates armour
 * resistance for exactly these — "4.0 × 0.8 mm" and "6.1 × 1.4 mm" — which is as close
 * to an official commercial size list as the standard gets.
 */
export const IS_STRIP_4_0_8: StripArmourDims = { kind: "strip", widthMm: 4.0, thicknessMm: 0.8 };
export const IS_STRIP_6_1_1_4: StripArmourDims = { kind: "strip", widthMm: 6.1, thicknessMm: 1.4 };

/**
 * The client's stated default for 3.5 core LT XLPE: "Galvanised Steel Strip Armour
 * size 4 × 0.8 mm ... which is very widely used."
 */
export const DEFAULT_STRIP_ARMOUR: StripArmourDims = IS_STRIP_4_0_8;

export interface StripArmourDims {
  kind: "strip";
  widthMm: number;
  thicknessMm: number;
}

export interface WireArmourDims {
  kind: "round-wire";
  diameterMm: number;
}

export type ArmourDims = StripArmourDims | WireArmourDims;

/** The strip sizes IS 7098 (Part 1) Table 7 names. */
export const STRIP_ARMOUR_SIZES: readonly StripArmourDims[] = [
  IS_STRIP_4_0_8,
  IS_STRIP_6_1_1_4,
] as const;

/** Round armour wire diameters, IS 7098 (Part 1) Table 6 col 4. */
export const WIRE_ARMOUR_SIZES: readonly WireArmourDims[] = [
  { kind: "round-wire", diameterMm: 1.4 },
  { kind: "round-wire", diameterMm: 1.6 },
  { kind: "round-wire", diameterMm: 2.0 },
  { kind: "round-wire", diameterMm: 2.5 },
  { kind: "round-wire", diameterMm: 3.15 },
  { kind: "round-wire", diameterMm: 4.0 },
] as const;

/**
 * IS 7098 (Part 1) Table 6, method (b) — armour size by calculated diameter under
 * armour. Method (a) is the flat 0.8 mm strip above 13 mm, handled separately.
 */
const TABLE_6_METHOD_B: readonly {
  upTo: number;
  stripThicknessMm: number | null;
  wireDiaMm: number;
}[] = [
  { upTo: 13, stripThicknessMm: null, wireDiaMm: 1.4 },
  { upTo: 25, stripThicknessMm: 0.8, wireDiaMm: 1.6 },
  { upTo: 40, stripThicknessMm: 0.8, wireDiaMm: 2.0 },
  { upTo: 55, stripThicknessMm: 1.4, wireDiaMm: 2.5 },
  { upTo: 70, stripThicknessMm: 1.4, wireDiaMm: 3.15 },
  { upTo: Infinity, stripThicknessMm: 1.4, wireDiaMm: 4.0 },
] as const;

function table6Row(diaUnderArmourMm: number) {
  for (const row of TABLE_6_METHOD_B) if (diaUnderArmourMm <= row.upTo) return row;
  return TABLE_6_METHOD_B[TABLE_6_METHOD_B.length - 1];
}

/**
 * Strip thickness the standard selects at this diameter.
 * Method (a) is a flat 0.8 mm above 13 mm; method (b) steps to 1.4 mm above 40 mm.
 * Returns null below 13 mm, where strip is not permitted at all (cl. 13.2).
 */
export function selectStripThickness(
  diaUnderArmourMm: number,
  method: ArmourMethod = "a",
): number | null {
  if (diaUnderArmourMm <= STRIP_ARMOUR_MIN_DIA_MM) return null;
  return method === "a" ? STANDARD_STRIP_THICKNESS_MM : table6Row(diaUnderArmourMm).stripThicknessMm;
}

/** Round armour wire diameter the standard selects at this diameter (Table 6 col 4). */
export function selectWireDiameter(diaUnderArmourMm: number): number {
  return table6Row(diaUnderArmourMm).wireDiaMm;
}

/** How the armour dimension prints on a GTP, e.g. "4 × 0.8 mm" or "Ø 2.0 mm". */
export function formatArmourDims(dims: ArmourDims): string {
  return dims.kind === "strip"
    ? `${dims.widthMm} × ${dims.thicknessMm} mm`
    : `Ø ${dims.diameterMm} mm`;
}

/** Is this armour type made of strip? */
export function isStripArmour(armour: ArmourType): boolean {
  return armour.includes("strip");
}

/** Is this armour type made of round wire? */
export function isWireArmour(armour: ArmourType): boolean {
  return armour.includes("wire");
}

/**
 * The armour size the standard selects for this cable, before the user overrides it.
 *
 * Strip defaults to method (a) — the flat 4.0 × 0.8 mm the client calls "very widely
 * used" — and falls back to method (b)'s thicker strip only where (a) does not reach.
 * Round wire steps through Table 6 col 4 by diameter.
 */
export function defaultDimsFor(armour: ArmourType, diaUnderArmourMm = 0): ArmourDims | null {
  if (armour === "Unarmoured") return null;

  if (isStripArmour(armour)) {
    const t = selectStripThickness(diaUnderArmourMm, "a");
    if (t === null) return DEFAULT_STRIP_ARMOUR; // caller surfaces the cl. 13.2 breach
    return t === IS_STRIP_6_1_1_4.thicknessMm ? IS_STRIP_6_1_1_4 : IS_STRIP_4_0_8;
  }

  return { kind: "round-wire", diameterMm: selectWireDiameter(diaUnderArmourMm) };
}

export interface ArmourGeometry {
  /** Number of strips or wires laid around the circumference. */
  count: number;
  /** Total steel cross-section, mm². */
  steelAreaSqMm: number;
  /** Steel weight per metre of cable, kg/m — excludes helical lay take-up. */
  kgPerM: number;
  /** How much the armour adds to the overall diameter, mm. */
  diameterIncreaseMm: number;
  /** Diameter over the armour, mm. */
  diaOverArmourMm: number;
}

/**
 * Armour geometry over a given diameter under armour.
 *
 * `diaUnderArmourMm` is the calculated diameter over the inner sheath — the surface the
 * armour is actually applied to. Returns null for unarmoured, so callers branch once.
 *
 * NOTE ON LAY: armour is applied helically, so the steel is slightly longer than the
 * cable. The take-up depends on the lay angle set on the armouring machine, which is a
 * production parameter nobody has given us. This returns the un-laid figure — a floor,
 * not an estimate dressed up as exact — and `layFactor` is there for when production
 * confirms the real number.
 */
export function armourGeometry(
  dims: ArmourDims | null,
  diaUnderArmourMm: number,
  layFactor = 1,
): ArmourGeometry | null {
  if (!dims || diaUnderArmourMm <= 0) return null;

  if (dims.kind === "strip") {
    const t = dims.thicknessMm;
    // Strips sit side by side around the circumference at the strip's mid-thickness.
    const count = Math.max(1, Math.round((Math.PI * (diaUnderArmourMm + t)) / dims.widthMm));
    // n × w × t collapses to π(D + t)t — width cancels, which is why the standard fixes
    // thickness and leaves width to commercial preference.
    const steelAreaSqMm = Math.PI * (diaUnderArmourMm + t) * t;
    return {
      count,
      steelAreaSqMm,
      kgPerM: steelAreaSqMm * STEEL_KG_PER_M_PER_SQMM * layFactor,
      // Strip armour is a single layer, so it adds twice its thickness to the diameter.
      diameterIncreaseMm: 2 * t,
      diaOverArmourMm: diaUnderArmourMm + 2 * t,
    };
  }

  const d = dims.diameterMm;
  const count = Math.max(1, Math.round((Math.PI * (diaUnderArmourMm + d)) / d));
  const steelAreaSqMm = count * ((Math.PI * d * d) / 4);
  return {
    count,
    steelAreaSqMm,
    kgPerM: steelAreaSqMm * STEEL_KG_PER_M_PER_SQMM * layFactor,
    diameterIncreaseMm: 2 * d,
    diaOverArmourMm: diaUnderArmourMm + 2 * d,
  };
}

export interface ArmourPermission {
  permitted: boolean;
  reason?: string;
  clause?: string;
}

/**
 * Whether the standards allow this armour on a cable of this size.
 *
 * The 13 mm rule is the one that bites: strip armour on a small 3.5 core is not
 * permitted, however widely strip is used on the larger sizes. Surfacing this at build
 * time is cheaper than hearing it from an inspector.
 */
export function checkArmourPermitted(
  armour: ArmourType,
  diaUnderArmourMm: number,
): ArmourPermission {
  if (armour === "Unarmoured") return { permitted: true };

  if (isStripArmour(armour) && diaUnderArmourMm > 0 && diaUnderArmourMm <= STRIP_ARMOUR_MIN_DIA_MM) {
    return {
      permitted: false,
      reason:
        `Calculated diameter under armour is ${diaUnderArmourMm.toFixed(1)} mm. At or below ` +
        `${STRIP_ARMOUR_MIN_DIA_MM} mm the armour must be galvanised round steel wire — strip is ` +
        "only permitted above that diameter.",
      clause: "IS 7098 (Part 1) cl. 13.2 / IS 1554 (Part 1) cl. 13.2",
    };
  }

  return { permitted: true };
}
