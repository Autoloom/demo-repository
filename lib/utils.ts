//  Contains cn(), the common utility for safely combining 
//  conditional Tailwind/CSS classes.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely. Every component uses this. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
