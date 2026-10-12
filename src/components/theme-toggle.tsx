"use client";

import { Moon, Sun } from "lucide-react";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { currentTheme, initialTheme, setTheme, subscribeTheme } from "@/lib/theme";
import { focus } from "./ui";

/** Light / dark switch: a key-style knob that slides between a sun and a moon. */
export function ThemeToggle() {
  // "light" during server rendering and hydration, then whatever the inline script applied.
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "light" as const);
  const dark = theme === "dark";

  // React's dev-mode remount resets <html> attributes, clearing what the inline script set.
  // Re-apply before paint; a no-op in production.
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", initialTheme());
  }, []);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={`relative inline-flex h-10 w-[4.75rem] shrink-0 items-center switch-track rounded-xl border border-border p-1 shadow-[inset_0_1px_2px_oklch(0_0_0/0.06)] ${focus}`}
    >
      {/* Track icons, faint, showing both choices. */}
      <span className="absolute inset-y-0 left-0 flex w-1/2 items-center justify-center text-faint" aria-hidden>
        <Sun className="size-4" />
      </span>
      <span className="absolute inset-y-0 right-0 flex w-1/2 items-center justify-center text-faint" aria-hidden>
        <Moon className="size-4" />
      </span>
      {/* The knob: a raised key carrying the active icon. */}
      <span
        aria-hidden
        className={`relative z-10 flex size-8 items-center justify-center switch-knob rounded-[10px] border border-border shadow-key transition-transform duration-200 ease-out ${
          dark ? "translate-x-[2.125rem]" : "translate-x-0"
        }`}
      >
        {dark ? <Moon className="size-4 text-tide" /> : <Sun className="size-4 text-ember" />}
      </span>
    </button>
  );
}
