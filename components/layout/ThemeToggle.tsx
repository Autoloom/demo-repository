/*  Dark mode switching and persistence */

"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
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
