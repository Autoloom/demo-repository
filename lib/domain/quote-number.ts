/**
 * Quote numbers.
 *
 * ── What was wrong ─────────────────────────────────────────────────────────────
 * A new quote took `Q-YYMM-` plus a RANDOM three-digit number. That is 900 possibilities a month,
 * and `quotesService.saveDraft` REPLACES any quote that already has the id it is given — so a new
 * quote that drew an id already in use silently overwrote the earlier one. By the birthday
 * problem that is a 7% chance across a dozen quotes in a month, 38% across thirty, and the
 * overwritten quote is simply gone: no error, no trace.
 *
 * So the number is now the next one in the month's series: the highest suffix already used, plus
 * one. Sequential also reads as what it is — the works can see how many quotes went out.
 */

/** `Q-2609-` for a date in September 2026. */
export function quotePrefix(date: Date): string {
  const y = String(date.getFullYear()).slice(2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `Q-${y}${m}-`;
}

/** The first number in a month's series, and what the demo's own seeded quotes already run past. */
export const FIRST_QUOTE_SUFFIX = 101;

export function nextQuoteId(existingIds: readonly string[], date: Date): string {
  const prefix = quotePrefix(date);
  let highest = FIRST_QUOTE_SUFFIX - 1;
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue;
    const suffix = Number(id.slice(prefix.length));
    if (Number.isInteger(suffix) && suffix > highest) highest = suffix;
  }
  return `${prefix}${highest + 1}`;
}
