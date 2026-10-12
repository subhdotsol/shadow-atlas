/**
 * Theme: "light" or "dark", applied as `data-theme` on <html>.
 *
 * On page load the inline script in the root layout uses the saved choice if there is one,
 * otherwise the OS setting, and applies it before first paint. Flipping the switch saves
 * the choice for next time.
 */
export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "shadow-atlas:theme";

/** Runs in <head> during HTML parsing, before anything is painted. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

/** The theme currently applied to the page. */
export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/** Theme for this page load: the saved choice, else the OS setting. */
export function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage blocked: fall back to the OS setting.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const listeners = new Set<() => void>();

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  listeners.forEach((l) => l());
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  // Keep tabs in step when the switch is flipped in another one.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY || (e.newValue !== "light" && e.newValue !== "dark")) return;
    document.documentElement.setAttribute("data-theme", e.newValue);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
