/* Shared role-aware sidebar/navigation rendering. */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { cn } from "@/lib/utils";
import { can } from "@/lib/rbac";
import { navGroups } from "@/lib/config/navigation";
import { useSessionStore } from "@/lib/store/session";

export function AppShellNav({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const role = useSessionStore((state) => state.role);

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-3">
      {navGroups.map((group) => {
        const visible = group.items.filter((item) => can(role, "view", item.resource));
        if (visible.length === 0) return null;
        return (
          <section key={group.label} className="space-y-2">
            {collapsed ? (
              <div className="mx-2 border-t border-border" aria-hidden="true" />
            ) : (
              <h2 className="px-2 text-xs font-medium uppercase text-muted-foreground">{group.label}</h2>
            )}
            <div className="space-y-1">
              {visible.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    aria-label={item.tag ? `${item.label} (${item.tag})` : item.label}
                    className={cn(
                      "relative flex min-h-10 items-center rounded-md text-sm transition-colors",
                      collapsed ? "justify-center px-0" : "gap-3 px-3",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {collapsed ? null : <span>{item.label}</span>}
                    {item.tag && !collapsed ? (
                      <span
                        className={cn(
                          "ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium leading-none tracking-wide",
                          active
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-highlight/10 text-highlight ring-1 ring-inset ring-highlight/25",
                        )}
                      >
                        {item.tag}
                      </span>
                    ) : null}
                    {/* Collapsed to icons only, the pill has nowhere to go — a dot keeps the cue. */}
                    {item.tag && collapsed ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute right-1.5 top-1.5 size-1.5 rounded-full",
                          active ? "bg-primary-foreground" : "bg-highlight",
                        )}
                      />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </nav>
  );
}
