"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMonthTab } from "@/lib/freight/dispatch-sheet-tabs";
import type { DispatchDashboardData } from "@/lib/freight/dispatch-dashboard-types";

const STORAGE_KEY = "alpha-freight-dispatch-tab";

function readStoredTab(): string {
  if (typeof window === "undefined") return formatMonthTab(new Date());
  return localStorage.getItem(STORAGE_KEY) || formatMonthTab(new Date());
}

export function useDispatchDashboard() {
  const [data, setData] = useState<DispatchDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(readStoredTab);

  const refresh = useCallback(
    async (tab?: string) => {
      const monthTab = tab ?? activeTab;
      setLoading(true);
      setError(null);
      try {
        const qs = monthTab ? `?tab=${encodeURIComponent(monthTab)}` : "";
        const res = await fetch(`/api/freight/dispatcher/dashboard${qs}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        const json = (await res.json()) as DispatchDashboardData;
        setData(json);
        if (json.sheet_meta.active_tab) {
          setActiveTab(json.sheet_meta.active_tab);
          localStorage.setItem(STORAGE_KEY, json.sheet_meta.active_tab);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    },
    [activeTab],
  );

  useEffect(() => {
    void refresh(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per tab change
  }, [activeTab]);

  function changeTab(tab: string) {
    setActiveTab(tab);
    localStorage.setItem(STORAGE_KEY, tab);
  }

  return { data, loading, error, refresh, activeTab, changeTab };
}
