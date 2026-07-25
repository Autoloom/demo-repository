"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BellIcon, RefreshCwIcon, LogOutIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { roles } from "@/lib/config/navigation";
import { dataService } from "@/lib/services";
import type { Role } from "@/lib/services/types";
import { useSessionStore } from "@/lib/store/session";

type AppShellHeaderProps = {
  onCommandPaletteOpenChange: (isOpen: boolean) => void;
};

export function AppShellHeader({ onCommandPaletteOpenChange }: AppShellHeaderProps) {
  const currentPath = usePathname();
  const router = useRouter();
  const currentRole = useSessionStore((state) => state.role);
  const setRole = useSessionStore((state) => state.setRole);
  const signOut = useSessionStore((state) => state.signOut);

  return (
    <header className="sticky top-0 z-50 flex min-h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:px-6">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          className="hidden min-w-64 justify-start text-muted-foreground md:inline-flex"
          onClick={() => onCommandPaletteOpenChange(true)}
        >
          <SearchIcon className="mr-2 size-4" />
          Search records
          <span className="ml-auto font-mono text-xs">⌘K</span>
        </Button>
        <Button type="button" variant="ghost" size="sm" className="lg:hidden" asChild>
          <Link href="/dashboard">Cable OS</Link>
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="role-switcher">
          Current role
        </label>
        <select
          id="role-switcher"
          value={currentRole}
          onChange={(event) => {
            const nextRole = event.target.value as Role;
            setRole(nextRole);
            if (currentPath.startsWith("/dashboard")) {
              router.replace(`/dashboard?role=${nextRole}`);
            }
          }}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          {roles.map((roleOption) => (
            <option key={roleOption} value={roleOption}>
              {roleOption}
            </option>
          ))}
        </select>
        <Button type="button" variant="ghost" size="icon" aria-label="Open approvals" asChild>
          <Link href="/approvals">
            <BellIcon className="size-4" />
          </Link>
        </Button>
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
  );
}
