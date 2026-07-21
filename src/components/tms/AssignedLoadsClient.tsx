"use client";

import { useCallback, useEffect, useState } from "react";
import { Truck } from "lucide-react";
import type { LoadRecord } from "@/lib/tms/loads";
import { loadStatusLabel } from "@/lib/tms/loads";

export function AssignedLoadsClient({ title }: { title: string }) {
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

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{title}</h1>
        <p className="text-sm text-[var(--color-muted)]">Your assigned loads</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Load #</th>
              <th className="px-4 py-3 font-medium">Lane</th>
              <th className="px-4 py-3 font-medium">Pickup</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loads.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-[var(--color-muted)]">
                  <Truck className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No assigned loads yet.
                </td>
              </tr>
            ) : (
              loads.map((load) => (
                <tr
                  key={load.id}
                  className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface)]/50"
                >
                  <td className="px-4 py-3 font-mono text-[var(--color-accent-2)]">
                    {load.load_number ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text)]">
                    {load.origin_city}, {load.origin_state} → {load.destination_city},{" "}
                    {load.destination_state}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {load.pickup_date ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[var(--color-accent-dim)] px-2.5 py-0.5 text-xs text-[var(--color-accent-2)]">
                      {loadStatusLabel(load.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
