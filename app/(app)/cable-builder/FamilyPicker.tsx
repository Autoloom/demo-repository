"use client";

/**
 * Cable family picker.
 *
 * Shows the whole product range from the brochure — including the lines we haven't
 * modelled yet — rather than only the one family that happens to work. A salesperson
 * looking for "Control cable" should find it and be told what's missing, not conclude
 * the tool can't do their job. Unbuilt families are visibly unbuilt; they don't quietly
 * produce a wrong quote.
 */

import { CheckCircle2Icon, CircleDashedIcon, CircleDotIcon } from "lucide-react";

import { CABLE_FAMILIES, FAMILY_STATUS_LABEL, type CableFamilyDef, type CableFamilyId } from "@/lib/domain/families";
import { cn } from "@/lib/utils";

const STATUS_ICON = {
  built: CheckCircle2Icon,
  partial: CircleDotIcon,
  planned: CircleDashedIcon,
} as const;

const STATUS_TONE = {
  built: "border-success/40 bg-success/10 text-success",
  partial: "border-warning/40 bg-warning/10 text-warning",
  planned: "border-border bg-muted text-muted-foreground",
} as const;

export function FamilyPicker({
  selected,
  onSelect,
}: {
  selected: CableFamilyId;
  onSelect: (id: CableFamilyId) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {CABLE_FAMILIES.map((family) => {
        const Icon = STATUS_ICON[family.status];
        const isSelected = family.id === selected;
        return (
          <button
            key={family.id}
            type="button"
            onClick={() => onSelect(family.id)}
            aria-pressed={isSelected}
            title={family.description}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isSelected
                ? "border-primary bg-primary-muted text-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            <Icon
              className={cn(
                "size-3.5 shrink-0",
                family.status === "built" && "text-success",
                family.status === "partial" && "text-warning",
                family.status === "planned" && "text-muted-foreground",
              )}
            />
            <span className={cn("font-medium", isSelected && "text-foreground")}>{family.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Shown when the chosen family has no schema yet — states what is missing, not "coming soon". */
export function FamilyNotModelled({ family }: { family: CableFamilyDef }) {
  return (
    <div className="rounded-md border border-dashed p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-medium">{family.label}</h2>
        <span className={cn("rounded-sm border px-2 py-0.5 text-xs font-medium", STATUS_TONE[family.status])}>
          {FAMILY_STATUS_LABEL[family.status]}
        </span>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{family.description}</p>

      <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Conductor</dt>
          <dd className="mt-0.5">{family.conductor}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Insulation</dt>
          <dd className="mt-0.5">{family.insulation}</dd>
        </div>
        {family.standards.length ? (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase text-muted-foreground">Standards</dt>
            <dd className="mt-0.5 font-mono text-xs">{family.standards.join(" · ")}</dd>
          </div>
        ) : null}
      </dl>

      {family.blockedOn ? (
        <div className="mt-4 rounded-md border border-warning/30 bg-warning/5 p-3">
          <p className="text-xs font-semibold uppercase text-warning">What&apos;s needed to build it</p>
          <p className="mt-1 text-sm text-muted-foreground">{family.blockedOn}</p>
        </div>
      ) : null}
    </div>
  );
}
