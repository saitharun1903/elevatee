"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Tells the server the browser's time zone (a cookie, no personal data) so server-rendered
 * dates use the user's zone instead of the server's. Refreshes once when it changes.
 */
export function TimezoneCookie({ current }: { current: string | null }) {
  const router = useRouter();
  useEffect(() => {
    let tz: string;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!tz || tz === current) return;
    document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [current, router]);
  return null;
}
