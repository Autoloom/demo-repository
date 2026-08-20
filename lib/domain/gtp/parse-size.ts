/**
 * Size-string parser (PRD P0-2 / design-doc §3 Moment 2, playbook rule #4).
 *
 * Accepts BOTH designation styles found on real orders, so the user can type whatever their
 * document says:
 *
 *   • WBSEDCL/KRYFS style:  `3Cx70 + 1Cx50 + 1Cx16`   (every group has a core count)
 *   • DHBVN/Haryana style:  `3C x 25 + 16 + 25 mm²`   (bare sizes after the phase group;
 *     per DHBVN CSC-69 Annexure-II note: first part = phase, middle = street light
 *     (where provided), LAST = bare messenger)
 *
 * Forgiving of: case, spaces, `×`/`x`/`X`, `sq mm`/`sqmm`/`mm2`/`mm²` suffixes. NEVER throws
 * or shows a bare "invalid input" — on failure returns a suggestion state. Playback is plain
 * language with a single confirm; never decompose into dropdowns.
 */
import { messengerSizeForPhase } from "@/lib/domain/standards/is14255-1995";
import { IS8130_2013_ENCODED_SIZES } from "@/lib/domain/standards/is8130-2013";

import type { CableConstruction, ConductorGroup, ParseResult } from "./types";

interface RawGroup {
  count: number;
  sizeSqMm: number;
  /** True when the token was a bare size (DHBVN style), e.g. the `25` in `3Cx16+25`. */
  bare: boolean;
  /** Position in the typed string — DHBVN role assignment is order-sensitive. */
  idx: number;
}

/** Split into groups, tolerant of notation. Returns [] if any token fails to parse. */
function tokenize(input: string): RawGroup[] {
  // Normalise: lowercase, unify multiplication signs, strip unit suffixes and whitespace.
  const cleaned = input
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/\bsq\s*mm\b/g, "")
    .replace(/\bsqmm\b/g, "")
    .replace(/\bmm2\b/g, "")
    .replace(/mm²/g, "")
    .replace(/\bmm\b/g, "")
    .replace(/\s+/g, "");

  const groups: RawGroup[] = [];
  let idx = 0;
  for (const part of cleaned.split("+")) {
    if (!part) continue;
    // Counted group: <count>C x <size>, e.g. "3cx70" (the "c" is optional: "3x70").
    const counted = part.match(/^(\d+(?:\.\d+)?)c?x(\d+(?:\.\d+)?)$/);
    if (counted) {
      const count = Number(counted[1]);
      const sizeSqMm = Number(counted[2]);
      if (!Number.isFinite(count) || !Number.isFinite(sizeSqMm) || count <= 0 || sizeSqMm <= 0) return [];
      groups.push({ count, sizeSqMm, bare: false, idx: idx++ });
      continue;
    }
    // Bare size (DHBVN style): just a number, an implied single conductor.
    const bare = part.match(/^(\d+(?:\.\d+)?)$/);
    if (bare) {
      const sizeSqMm = Number(bare[1]);
      if (!Number.isFinite(sizeSqMm) || sizeSqMm <= 0) return [];
      groups.push({ count: 1, sizeSqMm, bare: true, idx: idx++ });
      continue;
    }
    return [];
  }
  return groups;
}

/**
 * Assign physical roles.
 * - Power = the group with the highest core count (ties → largest size).
 * - DHBVN rule (applies when the phase group is counted and the rest are bare sizes):
 *   the LAST bare group is the messenger, any middle bare group is the street light.
 * - Otherwise (all groups counted, WBSEDCL style): the messenger is the remaining group
 *   matching the IS 14255 pairing for the power size, else the largest remaining.
 */
function assignRoles(raw: RawGroup[]): ConductorGroup[] {
  if (raw.length === 0) return [];

  // Power = the group with the most cores. On a tie (e.g. single-core service drops, where every
  // group is 1C) fall back to WRITING ORDER, not size: the phase is conventionally written first,
  // and a 1Cx16 + 1Cx25 cable is a 16 phase with a 25 messenger, not the other way round.
  const power = [...raw].sort((a, b) => b.count - a.count || a.idx - b.idx)[0];
  const remaining = raw.filter((g) => g !== power).sort((a, b) => a.idx - b.idx);

  const groups: ConductorGroup[] = [{ role: "power", count: power.count, sizeSqMm: power.sizeSqMm }];

  // The messenger is written LAST in both notations (DHBVN's Annexure-II note says so explicitly,
  // and the counted style follows the same convention). Prefer that over guessing by size, which
  // breaks when a street-light core happens to be larger than the messenger.
  // Which group is the messenger? Real designations disagree on ordering:
  //   • KRYFS/WBSEDCL write  3Cx70 + 1Cx50 + 1Cx16  → messenger SECOND, street light last
  //   • DHBVN writes         3Cx25 + 16 + 25        → street light middle, messenger LAST
  // So position alone can't decide. Use the IS 14255 pairing when it identifies exactly one
  // candidate (the strongest evidence available), and fall back to last-written otherwise.
  let messenger: RawGroup | undefined = remaining[remaining.length - 1];
  if (remaining.length > 1) {
    const pairing = messengerSizeForPhase(power.sizeSqMm);
    const matches = pairing ? remaining.filter((g) => g.sizeSqMm === pairing.messengerSqMm) : [];
    if (matches.length === 1) {
      messenger = matches[0];
    } else if (remaining.every((g) => g.bare)) {
      // DHBVN bare-size shorthand is explicit that the last value is the messenger.
      messenger = remaining[remaining.length - 1];
    }
  }
  if (messenger) {
    groups.push({ role: "messenger", count: messenger.count, sizeSqMm: messenger.sizeSqMm });
  }

  for (const g of remaining) {
    if (g === messenger) continue;
    groups.push({ role: "street-light", count: g.count, sizeSqMm: g.sizeSqMm });
  }

  return groups;
}

function describeGroup(g: ConductorGroup): string {
  const noun =
    g.role === "power"
      ? g.count === 1
        ? "power wire"
        : "power wires"
      : g.role === "messenger"
        ? "messenger"
        : g.role === "street-light"
          ? "street-light wire"
          : "core";
  return `**${g.count} ${noun}** @ ${g.sizeSqMm} sq mm`;
}

const EXAMPLE_SUGGESTIONS = ["3Cx70+1Cx50+1Cx16", "3Cx95 + 16 + 70", "3Cx50 + 35", "3Cx25 + 16 + 25"];

/** Parse a size string into a construction + plain-language playback, or a suggestion state. */
export function parseSizeString(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason: "Type the cable size the way it appears on the order, e.g. 3Cx70+1Cx50+1Cx16 or 3Cx95+16+70.",
      suggestions: EXAMPLE_SUGGESTIONS,
    };
  }

  const raw = tokenize(trimmed);
  if (raw.length === 0) {
    return {
      ok: false,
      reason: `We couldn't read "${trimmed}". Type it the way it appears on the order, e.g. 3Cx95+1Cx70 or 3Cx95+16+70.`,
      suggestions: EXAMPLE_SUGGESTIONS,
    };
  }

  // A lone bare number is ambiguous — ask for the full designation instead of guessing.
  if (raw.length === 1 && raw[0].bare) {
    return {
      ok: false,
      reason: `Just "${trimmed}"? Add the core count and the other wires, e.g. 3Cx${trimmed}+16+${messengerSizeForPhase(raw[0].sizeSqMm)?.messengerSqMm ?? 25}.`,
      suggestions: EXAMPLE_SUGGESTIONS,
    };
  }

  // Every size must be in an encoded IS table, else we can't derive its fields.
  const unsupported = raw.filter((g) => !IS8130_2013_ENCODED_SIZES.includes(g.sizeSqMm));
  if (unsupported.length > 0) {
    const sizes = unsupported.map((g) => `${g.sizeSqMm} sq mm`).join(", ");
    return {
      ok: false,
      reason: `We don't have IS table data for ${sizes} yet. Supported sizes: ${IS8130_2013_ENCODED_SIZES.join(", ")} sq mm.`,
      suggestions: IS8130_2013_ENCODED_SIZES.map((s) => `3Cx${s}`),
    };
  }

  const groups = assignRoles(raw);
  const construction: CableConstruction = { productLine: "AB_CABLE", groups, raw: trimmed };
  const playback = `${groups.map(describeGroup).join(" · ")} — LT Aerial Bunched, XLPE. Correct?`;

  return { ok: true, construction, playback };
}
