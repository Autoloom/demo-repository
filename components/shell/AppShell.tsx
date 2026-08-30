/*  Top-level authenticated application shell. 
    Coordinates navigation, sidebar state, header, command palette,
    session state, access checks, and renders protected page content.*/

"use client";

import Link from "next/link";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import * as React from "react";

import { AppShellCommand } from "@/components/layout/AppShellCommand";
import { AppShellHeader } from "@/components/layout/AppShellHeader";
import { AppShellNav } from "@/components/layout/AppShellNav";
import { Button } from "@/components/ui/button";
import { useAppShell } from "@/lib/hooks/useAppShell";
import { useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const currentRole = useSessionStore((state) => state.role);
  const currentUser = useSessionStore((state) => state.user);
  const {
    collapsed,
    commandOpen,
    hydrated,
    isAuthenticated,
    setCommandOpen,
    toggleSidebar,
  } = useAppShell();

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Loading Cable OS...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Redirecting to login...
      </div>
    );
  }

  return (
    <div className="min-h-dvh overflow-x-clip bg-background text-foreground">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden border-r bg-card transition-[width] duration-200 ease-out print:hidden lg:flex lg:flex-col",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className={cn("flex h-16 items-center border-b", collapsed ? "justify-center px-2" : "justify-between px-6")}>
          {collapsed ? null : (
            <Link href="/dashboard" className="font-mono text-sm font-semibold tracking-normal">
              Cable OS
            </Link>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            onClick={toggleSidebar}
          >
            {collapsed ? <PanelLeftOpenIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
          </Button>
        </div>
        <AppShellNav collapsed={collapsed} />
      </aside>

      <div className={cn("min-w-0 overflow-x-clip transition-[padding] duration-200 ease-out", collapsed ? "lg:pl-16" : "lg:pl-64")}>
        <AppShellHeader onCommandPaletteOpenChange={setCommandOpen} />
        <main className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 overflow-x-clip px-4 py-6 lg:px-6">
          <div className="rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{currentUser.name}</span> is viewing the portal as{" "}
            <span className="font-mono text-foreground">{currentRole}</span>. Use the role switcher to test RBAC.
          </div>
          {children}
        </main>
      </div>

      <AppShellCommand isOpen={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
