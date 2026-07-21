"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { DispatchLoadsTable } from "@/components/freight/DispatchLoadsTable";
import { DispatchMonthSelector } from "@/components/freight/DispatchMonthSelector";
import { LoadAssignModal } from "@/components/freight/LoadAssignModal";
import { LoadFormPanel } from "@/components/freight/LoadFormModal";
import { PortalClock } from "@/components/freight/PortalClock";
import { useDispatchDashboard } from "@/components/freight/useDispatchDashboard";
import type { DashboardLoad } from "@/lib/freight/dispatch-dashboard-types";

export function DispatcherLoadsPage() {
  const { data, loading, error, refresh, activeTab, changeTab } = useDispatchDashboard();
  const searchParams = useSearchParams();
  const showBook = searchParams.get("action") === "book";
  const [createOpen, setCreateOpen] = useState(showBook);
  const [editLoad, setEditLoad] = useState<DashboardLoad | null>(null);
  const [assignLoad, setAssignLoad] = useState<DashboardLoad | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  async function removeLoad(id: string) {
    if (!window.confirm("Remove this load? Carrier will be notified if Email is on the load.")) return;
    const res = await fetch(`/api/freight/dispatcher/loads?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      alert(json.error ?? "Delete failed");
      return;
    }
    await refresh();
  }

  if (loading && !data) {
    return <p className="p-8 text-[var(--color-muted)]">Loading loads…</p>;
  }
  if (error && !data) {
    return <p className="p-8 text-red-300">{error}</p>;
  }
  if (!data) return null;

  const supabaseMode = data.sheet_meta.source === "supabase";
  const sourceLabel = supabaseMode
    ? "Supabase (editable)"
    : data.sheet_meta.connected
      ? "Google Sheet (read-only — set SUPABASE_SERVICE_ROLE_KEY to add loads)"
      : "Not connected";

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]" style={{ fontFamily: "var(--font-display)" }}>
            Load board
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {data.loads.length} loads · {sourceLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PortalClock compact />
          <DispatchMonthSelector
            value={activeTab}
            options={data.sheet_meta.available_tabs}
            onChange={changeTab}
            disabled={loading}
          />
          {supabaseMode ? (
            <button
              type="button"
              onClick={() => setCreateOpen((o) => !o)}
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f]"
            >
              {createOpen ? "Hide form" : "Add load"}
            </button>
          ) : null}
        </div>
      </div>

      {!supabaseMode ? (
        <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Add load is disabled because Supabase is not connected. Add{" "}
          <code className="text-xs">SUPABASE_SERVICE_ROLE_KEY</code> in Vercel environment variables, then redeploy.
        </p>
      ) : null}

      {saveMsg ? (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/50 px-4 py-3 text-sm text-[var(--color-muted)]">
          {saveMsg}
        </p>
      ) : null}

      {supabaseMode && createOpen ? (
        <LoadFormPanel
          mode="create"
          variant="inline"
          monthTab={activeTab}
          onClose={() => setCreateOpen(false)}
          onSaved={async (message) => {
            setSaveMsg(message);
            setCreateOpen(false);
            await refresh();
          }}
        />
      ) : null}

      <DispatchLoadsTable
        loads={data.loads}
        onRemove={supabaseMode ? removeLoad : undefined}
        onAssign={supabaseMode ? setAssignLoad : undefined}
        onEdit={supabaseMode ? setEditLoad : undefined}
      />

      {editLoad ? (
        <LoadFormPanel
          mode="edit"
          variant="modal"
          monthTab={activeTab}
          load={editLoad}
          onClose={() => setEditLoad(null)}
          onSaved={async (message) => {
            setSaveMsg(message);
            setEditLoad(null);
            await refresh();
          }}
        />
      ) : null}

      {assignLoad ? (
        <LoadAssignModal
          load={assignLoad}
          onClose={() => setAssignLoad(null)}
          onSaved={async () => {
            await refresh();
            setAssignLoad(null);
          }}
        />
      ) : null}
    </div>
  );
}
