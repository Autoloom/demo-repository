/*  Shared Indian-currency and date-formatting utilities. */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Format a number as INR (₹, en-IN, no decimals). */
export function formatINR(value: number): string {
  return inr.format(value);
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/**
 * Format an ISO date as `dd MMM yyyy`. Accepts both date-only strings (`2026-06-21`) and full
 * datetimes (`2026-06-21T18:30:00.000Z`); the latter come from `now().toISOString()` on records
 * created in-app. Invalid/empty input renders an em dash rather than throwing.
 */
export function formatDate(iso: string): string {
  if (!iso) return "—";
  // A date-only string has no time component — anchor it to IST so the day doesn't drift.
  const parsed = iso.length === 10 ? new Date(`${iso}T00:00:00+05:30`) : new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateFmt.format(parsed);
}
