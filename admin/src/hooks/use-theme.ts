import { useCallback, useEffect, useState } from "react";
import { applyTheme, readThemePreference, resolveTheme, type ThemePreference } from "@/lib/theme";

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference);

  useEffect(() => {
    applyTheme(preference);
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const toggle = useCallback(() => {
    setPreference((current) => (resolveTheme(current) === "dark" ? "light" : "dark"));
  }, []);

  return { preference, resolved: resolveTheme(preference), setPreference, toggle };
}
