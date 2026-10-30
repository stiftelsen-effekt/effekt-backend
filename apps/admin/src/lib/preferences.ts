/**
 * Per-browser UI preferences (theme, density). One store shared by every component, so a
 * toggle in the user menu and one on /design stay in sync. Applied to <html> as a class
 * (`dark`) and a data attribute (`data-density`), which the tokens in app.css key off.
 */
import { useSyncExternalStore } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type Density = "comfortable" | "compact";
export type Preferences = { theme: ThemePreference; density: Density };

const STORAGE_KEY = "effekt-admin-preferences";
const defaults: Preferences = { theme: "system", density: "comfortable" };

function read(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      theme: ["light", "dark", "system"].includes(parsed.theme ?? "") ? parsed.theme! : "system",
      density: parsed.density === "compact" ? "compact" : "comfortable",
    };
  } catch {
    return defaults;
  }
}

let current: Preferences = typeof window === "undefined" ? defaults : read();
const listeners = new Set<() => void>();

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme !== "system") return theme;
  return systemDark() ? "dark" : "light";
}

export function applyPreferences(prefs: Preferences = current) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolveTheme(prefs.theme) === "dark");
  root.dataset.density = prefs.density;
}

export function setPreferences(patch: Partial<Preferences>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // storage unavailable: the preference lasts for this page load
  }
  applyPreferences();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (current.theme === "system") {
      applyPreferences();
      listener();
    }
  };
  media.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
  };
}

export function usePreferences() {
  const prefs = useSyncExternalStore(
    subscribe,
    () => current,
    () => defaults,
  );
  const resolvedTheme = resolveTheme(prefs.theme);
  return {
    ...prefs,
    resolvedTheme,
    setTheme: (theme: ThemePreference) => setPreferences({ theme }),
    toggleTheme: () => setPreferences({ theme: resolvedTheme === "dark" ? "light" : "dark" }),
    setDensity: (density: Density) => setPreferences({ density }),
    toggleDensity: () =>
      setPreferences({ density: prefs.density === "compact" ? "comfortable" : "compact" }),
  };
}
