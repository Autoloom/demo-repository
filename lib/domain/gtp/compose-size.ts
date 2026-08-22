/**
 * Compose a cable designation from discrete picker selections.
 *
 * The builder's size input is a set of dropdowns (one per part of the designation) rather than a
 * free-text box: the operator picks from closed sets of IS-table values, so an unsupported cable
 * is impossible to express instead of being rejected after typing (playbook rule #5,
 * "closed sets only — no free text where a vocabulary exists").
 *
 * This module only ASSEMBLES the canonical string. Parsing stays in parse-size.ts, which the
 * builder still runs on the composed string — one parser, one source of truth, and the picker
 * path exercises exactly the same code as a pasted designation.
 */
import { IS398_4_ENCODED_SIZES } from "@/lib/domain/standards/is398-4";
import { IS14255_1995_PHASE, messengerSizeForPhase } from "@/lib/domain/standards/is14255-1995";
import { IS8130_2013_ENCODED_SIZES } from "@/lib/domain/standards/is8130-2013";

import { parseSizeString } from "./parse-size";
import type { CableConstruction, ConductorGroup } from "./types";

/** What the pickers hold. `null` street light = the cable has no street-light core. */
export interface SizeSelection {
  coreCount: number;
  phaseSizeSqMm: number;
  streetLightSizeSqMm: number | null;
  messengerSizeSqMm: number;
}

/** Core counts AB cable is built in (1-phase service drops and 3-phase mains). */
export const CORE_COUNT_OPTIONS = [1, 3] as const;

/**
 * Phase sizes offerable for AB cable.
 *
 * Constrained by IS 14255, not by IS 8130. The conductor tables go further, but IS 14255 Table 3
 * (messenger pairing) and Table 4 (insulation thickness) both END AT 95 sq mm — so a 120 sq mm
 * AB cable has no messenger pairing and no insulation thickness in the standard. Offering it
 * would be a selectable dead end.
 */
export const PHASE_SIZE_OPTIONS = IS8130_2013_ENCODED_SIZES.filter((s) =>
  IS14255_1995_PHASE.some((row) => row.csaSqMm === s),
);

/** Messenger sizes with encoded IS 398-4 alloy rows. */
export const MESSENGER_SIZE_OPTIONS = IS398_4_ENCODED_SIZES;

/**
 * Street-light cores are small auxiliary conductors. Restrict to the smaller encoded sizes so the
 * picker can't offer a nonsensical "street light bigger than the phase" combination.
 */
export const STREET_LIGHT_SIZE_OPTIONS = IS8130_2013_ENCODED_SIZES.filter((s) => s <= 35);

/**
 * The messenger IS 14255 pairs with a given phase size, or undefined when the pairing table
 * has no row. Used to auto-fill (and to explain) the messenger choice.
 */
export function pairedMessengerFor(phaseSizeSqMm: number): { messengerSqMm: number; ref: string } | undefined {
  return messengerSizeForPhase(phaseSizeSqMm);
}

/** A sensible starting selection: the most common AB cable, 3-core 70 with its paired messenger. */
export function defaultSelection(): SizeSelection {
  const phaseSizeSqMm = 70;
  return {
    coreCount: 3,
    phaseSizeSqMm,
    streetLightSizeSqMm: 16,
    messengerSizeSqMm: pairedMessengerFor(phaseSizeSqMm)?.messengerSqMm ?? 50,
  };
}

/**
 * Recover picker state from a designation string (e.g. restoring a saved template).
 *
 * Returns undefined when the string can't be represented by the pickers, so callers can fall back
 * rather than silently showing a wrong selection.
 */
export function selectionFromSizeString(raw: string): SizeSelection | undefined {
  const parsed = parseSizeString(raw);
  if (!parsed.ok) return undefined;
  const power = parsed.construction.groups.find((g) => g.role === "power");
  const messenger = parsed.construction.groups.find((g) => g.role === "messenger");
  const streetLight = parsed.construction.groups.find((g) => g.role === "street-light");
  if (!power || !messenger) return undefined;
  return {
    coreCount: power.count,
    phaseSizeSqMm: power.sizeSqMm,
    streetLightSizeSqMm: streetLight?.sizeSqMm ?? null,
    messengerSizeSqMm: messenger.sizeSqMm,
  };
}

/**
 * Assemble the canonical designation, e.g. `3Cx70 + 1Cx16 + 1Cx50`.
 *
 * Uses the fully-counted form (every group carries its core count) rather than DHBVN's bare-size
 * shorthand, because it is unambiguous to the parser regardless of group ordering.
 */
/**
 * Build the canonical construction DIRECTLY from the picker selection.
 *
 * This is the important one. Designation ordering is genuinely ambiguous in the wild — KRYFS
 * writes the messenger second (`3Cx70 + 1Cx50 + 1Cx16`), DHBVN writes it last (`3Cx25 + 16 + 25`)
 * — so any round-trip through a string forces the parser to *guess* a role the picker already
 * knows for certain. Skipping the string removes that whole class of bug from the picker path.
 *
 * `parseSizeString` remains the entry point for typed or pasted designations, where guessing is
 * unavoidable and the plain-language playback lets the operator confirm the interpretation.
 */
export function constructionFromSelection(selection: SizeSelection): CableConstruction {
  const groups: ConductorGroup[] = [
    { role: "power", count: selection.coreCount, sizeSqMm: selection.phaseSizeSqMm },
    { role: "messenger", count: 1, sizeSqMm: selection.messengerSizeSqMm },
  ];
  if (selection.streetLightSizeSqMm != null) {
    groups.push({ role: "street-light", count: 1, sizeSqMm: selection.streetLightSizeSqMm });
  }
  return { productLine: "AB_CABLE", groups, raw: buildSizeString(selection) };
}

/** Plain-language playback of a selection, mirroring the parser's confirm step. */
export function describeSelection(selection: SizeSelection): string {
  const parts = [
    `**${selection.coreCount} power wire${selection.coreCount === 1 ? "" : "s"}** @ ${selection.phaseSizeSqMm} sq mm`,
    `**1 messenger** @ ${selection.messengerSizeSqMm} sq mm`,
  ];
  if (selection.streetLightSizeSqMm != null) {
    parts.push(`**1 street-light wire** @ ${selection.streetLightSizeSqMm} sq mm`);
  }
  return `${parts.join(" · ")} — LT Aerial Bunched, XLPE.`;
}

export function buildSizeString(selection: SizeSelection): string {
  // Messenger second, street light last — the order used by the approved KRYFS/WBSEDCL GTP
  // (3Cx70 + 1Cx50 + 1Cx16). The parser accepts either ordering, but emitting the golden
  // file's form keeps composed designations identical to the ones on real approved documents.
  const parts = [`${selection.coreCount}Cx${selection.phaseSizeSqMm}`, `1Cx${selection.messengerSizeSqMm}`];
  if (selection.streetLightSizeSqMm != null) {
    parts.push(`1Cx${selection.streetLightSizeSqMm}`);
  }
  return parts.join(" + ");
}
