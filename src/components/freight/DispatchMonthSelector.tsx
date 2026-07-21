"use client";

import { Calendar } from "lucide-react";
import { listMonthTabOptions } from "@/lib/freight/dispatch-sheet-tabs";

export function DispatchMonthSelector({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options?: string[];
  onChange: (tab: string) => void;
  disabled?: boolean;
}) {
  const tabs = options?.length ? options : listMonthTabOptions();

  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-2 text-sm">
      <Calendar className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
      <span className="text-[var(--color-muted)]">Month</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="dispatch-field min-w-[9rem] border-0 bg-[var(--color-surface)] font-medium outline-none"
      >
        {tabs.map((tab) => (
          <option key={tab} value={tab} className="bg-[var(--color-bg)]">
            {tab}
          </option>
        ))}
      </select>
    </label>
  );
}
