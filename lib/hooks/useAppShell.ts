"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { can, resourceForPath } from "@/lib/rbac";
import { hydrateSessionRole, useSessionStore } from "@/lib/store/session";

export function useAppShell() {
  const pathname = usePathname();
  const router = useRouter();
  const role = useSessionStore((state) => state.role);
  const hydrated = useSessionStore((state) => state.hydrated);
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const [commandOpen, setCommandOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    hydrateSessionRole();
    const handle = window.setTimeout(() => {
      setCollapsed(window.localStorage.getItem("cableos2:sidebar") === "collapsed");
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem("cableos2:sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    const resource = resourceForPath(pathname);
    if (!can(role, "view", resource)) {
      router.replace("/dashboard");
    }
  }, [hydrated, isAuthenticated, pathname, role, router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return {
    collapsed,
    commandOpen,
    hydrated,
    isAuthenticated,
    role,
    setCommandOpen,
    toggleSidebar,
  };
}
