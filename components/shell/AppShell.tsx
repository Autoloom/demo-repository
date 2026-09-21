"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FileCheckIcon,
  LogOutIcon,
  MoonIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  ReceiptIcon,
  RefreshCwIcon,
  SunIcon,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { can, resourceForPath } from "@/lib/rbac";
import { dataService } from "@/lib/services";
import type { Resource, Role } from "@/lib/services/types";
import { hydrateSessionRole, useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

const roles: Role[] = ["Owner", "Sales", "Operations", "Accounts"];

const navGroups: Array<{
  label: string;
  items: Array<{ href: string; label: string; resource: Resource; icon: React.ComponentType<{ className?: string }> }>;
}> = [
  // Cable OS 3 is the GTP generator on its own. The sales, operations, accounts and admin
  // groups are deliberately absent, not hidden behind a flag — see README.cable-os-3.md.
  {
    label: "Operations",
    items: [
      { href: "/gtp", label: "GTP Generator", resource: "gtp", icon: FileCheckIcon },
      { href: "/quote", label: "Quotation", resource: "quote", icon: ReceiptIcon },
    ],
  },
];

function ThemeToggle() {
  const [dark, setDark] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("cableos2:theme") === "dark";
  });

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => {
        const next = !dark;
        document.documentElement.classList.toggle("dark", next);
        window.localStorage.setItem("cableos2:theme", next ? "dark" : "light");
        setDark(next);
      }}
    >
      {dark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </Button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = useSessionStore((state) => state.role);
  const user = useSessionStore((state) => state.user);
  const hydrated = useSessionStore((state) => state.hydrated);
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const setRole = useSessionStore((state) => state.setRole);
  const signOut = useSessionStore((state) => state.signOut);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    hydrateSessionRole();
    const handle = window.setTimeout(() => {
      setCollapsed(window.localStorage.getItem("cableos2:sidebar") === "collapsed");
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  function toggleSidebar() {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem("cableos2:sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  React.useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    const resource = resourceForPath(pathname);
    if (!can(role, "view", resource)) {
      // GTP-only build: there is no dashboard to bounce to, so a role without GTP access
      // goes back to the login screen rather than to a route that no longer exists.
      router.replace("/gtp");
    }
  }, [hydrated, isAuthenticated, pathname, role, router]);

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
            <Link href="/gtp" className="font-mono text-sm font-semibold tracking-normal">
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
      </aside>

      <div className={cn("min-w-0 overflow-x-clip transition-[padding] duration-200 ease-out print:pl-0!", collapsed ? "lg:pl-16" : "lg:pl-64")}>
        <header className="sticky top-0 z-50 flex min-h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur print:hidden lg:px-6">
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" size="sm" className="lg:hidden" asChild>
              <Link href="/gtp">Cable OS</Link>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="role-switcher">
              Current role
            </label>
            <select
              id="role-switcher"
              value={role}
              onChange={(event) => {
                const nextRole = event.target.value as Role;
                setRole(nextRole);
              }}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              {roles.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <ThemeToggle />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Reset demo data"
              onClick={async () => {
                await dataService.reset();
                router.refresh();
              }}
            >
              <RefreshCwIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={() => {
                signOut();
                router.replace("/login");
              }}
            >
              <LogOutIcon className="size-4" />
            </Button>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 overflow-x-clip px-4 py-6 lg:px-6">
          <div className="rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground print:hidden">
            <span className="font-medium text-foreground">{user.name}</span> is viewing the portal as{" "}
            <span className="font-mono text-foreground">{role}</span>. Use the role switcher to test RBAC.
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
