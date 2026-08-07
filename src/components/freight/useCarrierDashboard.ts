"use client";

import { useCallback, useEffect, useState } from "react";
import type { CarrierDashboardData } from "@/lib/freight/carrier-dashboard-types";
import { useAutoRefresh } from "@/lib/hooks/useAutoRefresh";

export function useCarrierDashboard() {
  const [data, setData] = useState<CarrierDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (soft = false) => {
    if (!soft) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch("/api/carrier/dashboard", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      setData((await res.json()) as CarrierDashboardData);
      setError(null);
    } catch (e) {
      if (!soft) {
        setError(e instanceof Error ? e.message : "Could not load dashboard");
      }
    } finally {
      if (!soft) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  useAutoRefresh(() => refresh(true), { intervalMs: 20000 });

  return {
    data,
    loading,
    error,
    refresh: () => refresh(false),
  };
}
