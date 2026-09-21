"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

/*
  PLACEHOLDER metric card (client decision). Kept in the library but NOT wired to a real metric.
  Decorative glow/gradient REMOVED; token colors only; dummy content. See approved-components.md §6.
  When a real Dashboard metric is chosen, give it proper props + INR formatting via MoneyCell.
*/
interface AnimatedMetricCardProps {
  label?: string;
  value?: string;
  hint?: string;
  enableAnimations?: boolean;
  className?: string;
}

export function AnimatedMetricCard({
  label = "Placeholder metric",
  value = "—",
  hint = "Not wired yet",
  enableAnimations = true,
  className,
}: AnimatedMetricCardProps) {
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  return (
    <motion.div
      className={cn(
        "bg-card border rounded-lg p-6 flex flex-col gap-2 shadow-sm",
        className,
      )}
      initial={shouldAnimate ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-4xl font-semibold text-foreground tabular-nums">
        {value}
      </span>
      <span className="text-xs text-text-subtle">{hint}</span>
    </motion.div>
  );
}
