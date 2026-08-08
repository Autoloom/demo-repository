/* Global command palette/search interface used by the application shell. */

"use client";

import Link from "next/link";
import { CommandIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { navGroups } from "@/lib/config/navigation";
import { can } from "@/lib/rbac";
import { useSessionStore } from "@/lib/store/session";

type AppShellCommandProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export function AppShellCommand({ isOpen, onOpenChange }: AppShellCommandProps) {
  const currentRole = useSessionStore((state) => state.role);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-overlay px-4 pt-16">
      <div className="w-full max-w-2xl rounded-lg border bg-popover p-4 shadow-lg">
        <div className="flex items-center gap-3 border-b pb-3">
          <CommandIcon className="size-4 text-muted-foreground" />
          <input
            autoFocus
            aria-label="Command search"
            placeholder="Search records, pages, and actions"
            className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Esc
          </Button>
        </div>
        <div className="grid gap-2 pt-3">
          {navGroups.flatMap((group) =>
            group.items
              .filter((navItem) => can(currentRole, "view", navItem.resource))
              .map((navItem) => (
                <Link
                  key={navItem.href}
                  href={navItem.href}
                  className="rounded-md px-3 py-2 text-sm hover:bg-muted"
                  onClick={() => onOpenChange(false)}
                >
                  Go to {navItem.label}
                </Link>
              )),
          )}
        </div>
      </div>
    </div>
  );
}
