/**
 * Inspection-call scheduling rules (kamble-meeting-improvements.md §4).
 *
 * Marketing must place the inspection call ~10 days before the cable is ready,
 * and the third-party inspector then takes ~10–12 days to arrive. If the call is
 * placed late, finished cable sits idle on the floor — the most expensive mistake
 * the platform can prevent. Everything here is pure date math over the pinned
 * clock so pages and the signal engine agree on the same "call by" date.
 */
import { daysUntil } from "@/lib/domain/clock";
import type { Order } from "@/lib/services/types";

/** Call the inspection this many days before estimated completion. */
export const INSPECTION_CALL_LEAD_DAYS = 10;

/** Typical inspector arrival lag after the call is placed. */
export const INSPECTOR_ARRIVAL_DAYS = 11;

/** ISO date (yyyy-mm-dd) shifted by `days`. */
export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00+05:30`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The date the inspection call must be placed by, or null when no ECD is set. */
export function inspectionCallByDate(order: Pick<Order, "estimatedCompletionDate">): string | null {
  if (!order.estimatedCompletionDate) return null;
  return addDaysIso(order.estimatedCompletionDate, -INSPECTION_CALL_LEAD_DAYS);
}

/** Expected inspector arrival for a call placed on `callDate`. */
export function inspectorEtaFrom(callDate: string): string {
  return addDaysIso(callDate, INSPECTOR_ARRIVAL_DAYS);
}

export type InspectionCallUrgency =
  | { state: "none" }
  | { state: "scheduled"; callBy: string; daysLeft: number }
  | { state: "due"; callBy: string; daysLeft: number }
  | { state: "overdue"; callBy: string; overdueBy: number };

/**
 * Live countdown state for an order's inspection call. "due" = within 3 days of
 * the call-by date; "overdue" = the date passed without a call being logged.
 */
export function inspectionCallUrgency(
  order: Pick<Order, "estimatedCompletionDate" | "inspectionStatus">,
): InspectionCallUrgency {
  const callBy = inspectionCallByDate(order);
  if (!callBy) return { state: "none" };
  if (order.inspectionStatus && order.inspectionStatus !== "Not called") return { state: "none" };
  const daysLeft = daysUntil(callBy);
  if (daysLeft < 0) return { state: "overdue", callBy, overdueBy: -daysLeft };
  if (daysLeft <= 3) return { state: "due", callBy, daysLeft };
  return { state: "scheduled", callBy, daysLeft };
}
