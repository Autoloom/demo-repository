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
                    aria-label={item.label}
                    className={cn(
                      "flex min-h-10 items-center rounded-md text-sm transition-colors",
                      collapsed ? "justify-center px-0" : "gap-3 px-3",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {collapsed ? null : <span>{item.label}</span>}
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
