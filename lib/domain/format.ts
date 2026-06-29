/**
 * Centralized formatting. Pages/components use these (or the MoneyCell/DateCell components),
 * never inline `toLocaleString` / ad-hoc date formatting. See patterns.md §9.
 */

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

/** Format an ISO date string as `dd MMM yyyy`. */
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(`${iso}T00:00:00+05:30`));
}
