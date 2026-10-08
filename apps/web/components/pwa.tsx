"use client";

import { useEffect } from "react";

/** Registers the service worker in production builds only. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* installability is optional; the app works without it */
    });
  }, []);
  return null;
}
