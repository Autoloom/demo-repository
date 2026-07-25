"use client";

import { Cable, CircleAlert, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export function LoadingState() {
  return (
    <div className="grid animate-pulse gap-4 lg:grid-cols-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="h-4 w-1/2 rounded-md bg-muted" />
          <div className="h-9 rounded-md bg-muted" />
          <div className="h-24 rounded-md bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-danger bg-card p-4">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-1 h-4 w-4 text-danger" aria-hidden="true" />
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Quote data could not load</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Cable,
}: {
  title: string;
  description: string;
  icon?: typeof Cable;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted p-6 text-center">
      <Icon className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function Panel({
  title,
  description,
  icon: Icon,
  action,
  children,
  collapsible = true,
  defaultOpen = true,
  storageKey,
}: {
  title: string;
  description?: string;
  icon?: typeof Cable;
  action?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  storageKey?: string;
}) {
  const [open, setOpen] = React.useState(() => {
    if (!collapsible) return true;
    if (storageKey && typeof window !== "undefined") {
      const stored = window.localStorage.getItem(`cableos2:panel:${storageKey}`);
      if (stored === "open") return true;
      if (stored === "closed") return false;
    }
    return defaultOpen;
  });

  function toggle() {
    setOpen((value) => {
      const next = !value;
      if (storageKey && typeof window !== "undefined") {
        window.localStorage.setItem(`cableos2:panel:${storageKey}`, next ? "open" : "closed");
      }
      return next;
    });
  }

  const bodyId = `panel-body-${(storageKey ?? title).replace(/\s+/g, "-").toLowerCase()}`;

  const header = (
    <div className="flex min-w-0 gap-3">
      {Icon ? (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}
      <div className="min-w-0 space-y-1 text-left">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );

  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        {collapsible ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={bodyId}
            className="flex min-w-0 flex-1 items-start gap-2 text-left"
          >
            <ChevronDown
              className={cn("mt-2.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
              aria-hidden="true"
            />
            {header}
          </button>
        ) : (
          header
        )}
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {open ? <div id={bodyId} className="p-4">{children}</div> : null}
    </section>
  );
}

import { ChevronDown } from "lucide-react";
import * as React from "react";
