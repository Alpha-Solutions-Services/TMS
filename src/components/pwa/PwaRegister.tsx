"use client";

import { useEffect } from "react";

/**
 * Registers a no-op SW only to upgrade/clear old Portal caches.
 * Does not intercept navigations (those broke Google login).
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void (async () => {
      try {
        await navigator.serviceWorker.register("/sw.js");
      } catch {
        /* ignore */
      }
    })();
  }, []);

  return null;
}
