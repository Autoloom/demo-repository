/*  Encapsulates shared AppShell state/behaviour so shell components
    do not independently duplicate session/navigation logic. */

"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@auth0/nextjs-auth0";

import { can, resourceForPath } from "@/lib/rbac";
import { useSessionStore } from "@/lib/store/session";

export function useAppShell() {
  const currentPath = usePathname();
  const router = useRouter();

  const { user, isLoading } = useUser();

  const currentRole = useSessionStore((state) => state.role);

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    const sidebarRestoreTimer = window.setTimeout(() => {
      setIsSidebarCollapsed(
        window.localStorage.getItem("cableos2:sidebar") === "collapsed",
      );
    }, 0);

    return () => window.clearTimeout(sidebarRestoreTimer);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((currentValue) => {
      const nextValue = !currentValue;

      window.localStorage.setItem(
        "cableos2:sidebar",
        nextValue ? "collapsed" : "expanded",
      );

      return nextValue;
    });
  }, []);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!user) {
      router.replace("/login");
      return;
    }

    const resource = resourceForPath(currentPath);

    if (!can(currentRole, "view", resource)) {
      router.replace("/dashboard");
    }
  }, [isLoading, user, currentPath, currentRole, router]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();

        setIsCommandPaletteOpen(
          (currentValue) => !currentValue,
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () =>
      window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    collapsed: isSidebarCollapsed,
    commandOpen: isCommandPaletteOpen,

    hydrated: !isLoading,
    isAuthenticated: Boolean(user),

    role: currentRole,

    setCommandOpen: setIsCommandPaletteOpen,
    toggleSidebar,
  };
}