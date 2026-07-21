"use client";

import { useCallback, useEffect, useState } from "react";
import type { CarrierDashboardData } from "@/lib/freight/carrier-dashboard-types";

export function useCarrierDashboard() {
  const [data, setData] = useState<CarrierDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/freight/carrier/dashboard", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      setData((await res.json()) as CarrierDashboardData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
