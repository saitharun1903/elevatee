"use client";

import { useEffect } from "react";

/** Applies the theme saved on the account, so it follows the user to every device. */
export function ThemeSync({ theme }: { theme: "system" | "light" | "dark" }) {
  useEffect(() => {
    try {
      if (theme === "system") localStorage.removeItem("elevate-theme");
      else localStorage.setItem("elevate-theme", theme);
    } catch {
      /* storage blocked: the attribute below still applies for this visit */
    }
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  return null;
}
