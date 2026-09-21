"use client";

import { useEffect } from "react";

/**
 * GitHub Pages has no server-side rewrites, so a direct hit on
 * "/quote/<real-id>" (or a refresh on it) serves this static 404 file
 * instead of the app. This is the standard SPA-on-static-hosting redirect:
 * stash the path the visitor actually wanted in a query param and send them
 * to the app shell, which un-stashes it in layout.tsx before React mounts.
 * See app/layout.tsx's inline script for the other half.
 */
export default function NotFound() {
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const target = `${pathname}${search}${hash}`;
    sessionStorage.setItem("cableos-spa-redirect", target);
    window.location.replace("/demo-repository/");
  }, []);

  return null;
}
