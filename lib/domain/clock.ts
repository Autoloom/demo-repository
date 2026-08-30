/*  Centralises application time and date-difference calculations; 
    currently uses a pinned/reference date. */

const PINNED = new Date("2026-06-23T09:00:00+05:30");

export function now(): Date {
  return PINNED ? new Date(PINNED) : new Date();
}

/** Whole days from `now()` until the given ISO date (negative = overdue). */
export function daysUntil(iso: string): number {
  const due = new Date(`${iso}T00:00:00+05:30`).getTime();
  return Math.ceil((due - now().getTime()) / 86_400_000);
}
