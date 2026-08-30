"use client";

/**
 * The four-status GTP tracker (PRD §5.2), rendered as a visible chain rather than a lone badge:
 *
 *   Draft → Submitted → Corrections received → Approved
 *
 * Deliberately dumb — four states, big targets, dates recorded automatically — because the person
 * updating it is a documentation clerk between other jobs, not a project manager.
 *
 * "Corrections received" sits on the path rather than off to the side: coming back with changes is
 * the normal case, not an exception, and hiding it would make the tracker lie about how GTPs work.
 */
import { Check, CircleAlert, CircleDot } from "lucide-react";

import type { GtpStatus } from "@/lib/services";
import { cn } from "@/lib/utils";

const CHAIN: { status: GtpStatus; hint: string }[] = [
  { status: "Draft", hint: "Being prepared" },
  { status: "Submitted", hint: "Sent for stamping" },
  { status: "Corrections received", hint: "Came back with changes" },
  { status: "Approved", hint: "Stamped — production can start" },
];

/** How far along the chain a status sits. Corrections is a detour, not progress past Submitted. */
function stageIndex(status: GtpStatus): number {
  return CHAIN.findIndex((step) => step.status === status);
}

export function StatusTracker({
  status,
  onChange,
  disabled,
}: {
  status: GtpStatus;
  /** Omit to render read-only (e.g. in a list). */
  onChange?: (next: GtpStatus) => void;
  disabled?: boolean;
}) {
  const current = stageIndex(status);

  return (
    <ol className="flex flex-wrap items-stretch gap-2">
      {CHAIN.map((step, index) => {
        const isCurrent = step.status === status;
        // Approved is terminal; a GTP that's back for corrections hasn't "passed" Submitted.
        const isDone = status === "Approved" ? index < current : index < current && status !== "Corrections received";
        const isCorrections = step.status === "Corrections received";
        const interactive = Boolean(onChange) && !disabled && !isCurrent;

        const body = (
          <>
            <span className="flex items-center gap-1.5">
              {isDone ? (
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : isCurrent && isCorrections ? (
                <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : isCurrent ? (
                <CircleDot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-current opacity-40" />
              )}
              <span className="text-sm font-medium">{step.status}</span>
            </span>
            <span className="mt-0.5 text-xs opacity-80">{step.hint}</span>
          </>
        );

        const tone = isCurrent
          ? isCorrections
            ? "border-warning bg-warning/10 text-warning"
            : step.status === "Approved"
              ? "border-success bg-success/10 text-success"
              : "border-primary bg-primary/10 text-primary"
          : isDone
            ? "border-success/30 bg-success/5 text-success"
            : "border-border bg-card text-muted-foreground";

        return (
          <li key={step.status} className="min-w-40 flex-1">
            {interactive ? (
              <button
                type="button"
                onClick={() => onChange?.(step.status)}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex h-full w-full flex-col items-start rounded-md border p-3 text-left transition-colors hover:brightness-95",
                  tone,
                )}
              >
                {body}
              </button>
            ) : (
              <div
                aria-current={isCurrent ? "step" : undefined}
                className={cn("flex h-full flex-col items-start rounded-md border p-3", tone, disabled && "opacity-60")}
              >
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
