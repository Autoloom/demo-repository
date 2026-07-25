"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { can, resourceForPath } from "@/lib/rbac";
import { hydrateSessionRole, useSessionStore } from "@/lib/store/session";

export function useAppShell() {
  const currentPath = usePathname();
  const router = useRouter();
  const currentRole = useSessionStore((state) => state.role);
  const isSessionHydrated = useSessionStore((state) => state.hydrated);
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    hydrateSessionRole();
    const sidebarRestoreTimer = window.setTimeout(() => {
      setIsSidebarCollapsed(window.localStorage.getItem("cableos2:sidebar") === "collapsed");
    }, 0);
    return () => window.clearTimeout(sidebarRestoreTimer);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((currentValue) => {
      const nextValue = !currentValue;
      window.localStorage.setItem("cableos2:sidebar", nextValue ? "collapsed" : "expanded");
      return nextValue;
    });
  }, []);

  useEffect(() => {
    if (!isSessionHydrated) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    const resource = resourceForPath(currentPath);
    if (!can(currentRole, "view", resource)) {
      router.replace("/dashboard");
    }
  }, [isSessionHydrated, isAuthenticated, currentPath, currentRole, router]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen((currentValue) => !currentValue);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    collapsed: isSidebarCollapsed,
    commandOpen: isCommandPaletteOpen,
    hydrated: isSessionHydrated,
    isAuthenticated,
    role: currentRole,
    setCommandOpen: setIsCommandPaletteOpen,
    toggleSidebar,
  };
}
