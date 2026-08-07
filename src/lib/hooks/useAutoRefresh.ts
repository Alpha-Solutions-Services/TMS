"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Visibility-aware polling: refreshes when the tab is visible.
 * Soft refresh (does not force loading spinners if refreshSoft provided).
 */
export function useAutoRefresh(
  refresh: () => void | Promise<void>,
  opts?: { intervalMs?: number; enabled?: boolean },
) {
  const intervalMs = opts?.intervalMs ?? 20000;
  const enabled = opts?.enabled ?? true;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const tick = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    void refreshRef.current();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(tick, intervalMs);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, intervalMs, tick]);
}
