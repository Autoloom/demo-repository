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

  const { user: auth0User, isLoading: auth0IsLoading } = useUser();
  const sessionUser = useSessionStore((state) => state.user);
  const currentRole = useSessionStore((state) => state.role);

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

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
    // Give DashboardPageContent time to populate session store
    // Only check after Auth0 finishes loading
    if (auth0IsLoading) {
      return;
    }

    // Mark that we've done the auth check
    setHasCheckedAuth(true);

    // Check session store first (server-side auth), then fall back to Auth0
    // Auth0 user has `sub` (not `id`), so check both
    const user = sessionUser.id 
      ? sessionUser 
      : auth0User && (auth0User.sub || auth0User.email)
      ? auth0User
      : null;

    if (!user || (!user.id && !user.sub)) {
      router.replace("/login");
      return;
    }

    const resource = resourceForPath(currentPath);

    if (!can(currentRole, "view", resource)) {
      router.replace("/dashboard");
    }
  }, [sessionUser.id, auth0User, currentPath, currentRole, auth0IsLoading, router]);

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

    hydrated: !auth0IsLoading || hasCheckedAuth,
    isAuthenticated: Boolean(sessionUser.id || auth0User || !hasCheckedAuth),

    role: currentRole,

    setCommandOpen: setIsCommandPaletteOpen,
    toggleSidebar,
  };
}