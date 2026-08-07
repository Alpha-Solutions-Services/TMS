"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMonthTab } from "@/lib/freight/dispatch-sheet-tabs";
import type { DispatchDashboardData } from "@/lib/freight/dispatch-dashboard-types";
import { useAutoRefresh } from "@/lib/hooks/useAutoRefresh";

const STORAGE_KEY = "alpha-freight-dispatch-tab";

function readStoredTab(): string {
  if (typeof window === "undefined") return formatMonthTab(new Date());
  return localStorage.getItem(STORAGE_KEY) || formatMonthTab(new Date());
}

export function useDispatchDashboard() {
  const [data, setData] = useState<DispatchDashboardData | null>(null);
  const [canViewContacts, setCanViewContacts] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(readStoredTab);

  const refresh = useCallback(
    async (tab?: string, soft = false) => {
      const monthTab = tab ?? activeTab;
      if (!soft) {
        setLoading(true);
        setError(null);
      }
      try {
        const qs = monthTab ? `?tab=${encodeURIComponent(monthTab)}` : "";
        const res = await fetch(`/api/dispatcher/dashboard${qs}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        const json = (await res.json()) as DispatchDashboardData & {
          canViewContacts?: boolean;
        };
        setData(json);
        setCanViewContacts(json.canViewContacts !== false);
        setError(null);
        if (json.sheet_meta.active_tab) {
          setActiveTab(json.sheet_meta.active_tab);
          localStorage.setItem(STORAGE_KEY, json.sheet_meta.active_tab);
        }
      } catch (e) {
        if (!soft) {
          setError(e instanceof Error ? e.message : "Failed to load dashboard");
        }
      } finally {
        if (!soft) setLoading(false);
      }
    },
    [activeTab],
  );

  useEffect(() => {
    void refresh(activeTab, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per tab change
  }, [activeTab]);

  useAutoRefresh(() => refresh(undefined, true), { intervalMs: 30000 });

  function changeTab(tab: string) {
    setActiveTab(tab);
    localStorage.setItem(STORAGE_KEY, tab);
  }

  return {
    data,
    loading,
    error,
    refresh: (tab?: string) => refresh(tab, false),
    activeTab,
    changeTab,
    canViewContacts,
  };
}
