"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadBoard } from "@/components/tms/LoadBoard";
import type { LoadRecord } from "@/lib/tms/loads";

export function DispatcherDashboardClient({ isSuper }: { isSuper: boolean }) {
  const [loads, setLoads] = useState<LoadRecord[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/loads");
    if (res.ok) {
      const data = await res.json();
      setLoads(data.loads ?? []);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <LoadBoard loads={loads} isSuper={isSuper} onRefresh={() => void refresh()} />;
}
