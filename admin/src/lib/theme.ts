export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "effekt-admin-theme";

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // storage unavailable
  }
  return "system";
}

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(preference: ThemePreference) {
  document.documentElement.classList.toggle("dark", resolveTheme(preference) === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // storage unavailable
  }
}
