"use client";

/**
 * GTP home — the three things a user comes here to do (PRD §5.2 list view + standards visibility):
 *   1. New GTP           → the engine-backed builder
 *   2. Review GTPs       → what's been made, and open one to change it
 *   3. Review IS standards → what the engine derives from, and record amendments
 *
 * Deliberately a hub, not a dumping ground: one card per intent, primary action first.
 */
import { BookOpen, FilePlus2, FileStack } from "lucide-react";
import Link from "next/link";

const OPTIONS = [
  {
    href: "/gtp/new",
    icon: FilePlus2,
    title: "New GTP",
    description: "Build a GTP from a template or from scratch. The IS values fill themselves in.",
    primary: true,
  },
  {
    href: "/gtp/review",
    icon: FileStack,
    title: "Review GTPs",
    description: "See every GTP you've made, check its status, and open one to make changes.",
    primary: false,
  },
  {
    href: "/gtp/standards",
    icon: BookOpen,
    title: "Review IS standards",
    description: "See the IS tables the engine uses, and record an amendment when a standard changes.",
    primary: false,
  },
] as const;

export function GtpHome() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        return (
          <Link
            key={option.href}
            href={option.href}
            className={
              option.primary
                ? "flex flex-col gap-2 rounded-lg border-2 border-primary bg-primary/5 p-5 transition-colors hover:bg-primary/10"
                : "flex flex-col gap-2 rounded-lg border border-border bg-card p-5 transition-colors hover:bg-muted"
            }
          >
            <Icon
              className={option.primary ? "h-6 w-6 text-primary" : "h-6 w-6 text-muted-foreground"}
              aria-hidden="true"
            />
            <span className="font-semibold text-foreground">{option.title}</span>
            <span className="text-sm text-muted-foreground">{option.description}</span>
          </Link>
        );
      })}
    </div>
  );
}
