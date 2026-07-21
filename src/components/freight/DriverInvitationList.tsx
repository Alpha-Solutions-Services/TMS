"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  driver_email: string;
  driver_name: string | null;
  status: string;
  expires_at: string;
  created_at: string;
};

export function DriverInvitationList() {
  const [rows, setRows] = useState<Row[]>([]);

  async function reload() {
    const sb = createClient();
    if (!sb) return;
    const { data } = await sb
      .from("driver_invitations")
      .select("id,driver_email,driver_name,status,expires_at,created_at")
      .order("created_at", { ascending: false });
    setRows(((data ?? []) as Row[]));
  }

  useEffect(() => {
    void reload();
  }, []);

  return (
    <div className="mt-10 space-y-3">
      <h3 className="text-sm font-semibold text-[var(--color-text)]">Pending invitations</h3>
      {rows.filter((r) => r.status === "pending").length === 0 ? (
        <p className="text-xs text-[var(--color-muted)]">No outbound invites.</p>
      ) : (
        rows
          .filter((r) => r.status === "pending")
          .map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-4 py-3 text-xs">
              <div>
                <p className="font-semibold text-[var(--color-text)]">{r.driver_name || "Driver"}</p>
                <p className="text-[var(--color-muted)]">{r.driver_email}</p>
              </div>
              <div className="text-right text-[var(--color-muted)]">
                <p>{new Date(r.expires_at).toLocaleDateString()} expiry</p>
                <InvitationActions id={r.id} onDone={reload} />
              </div>
            </div>
          ))
      )}
    </div>
  );
}

function InvitationActions({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function cancel() {
    setBusy(true);
    const sb = createClient();
    if (sb)
      await sb.from("driver_invitations").delete().eq("id", id);
    onDone();
    setBusy(false);
  }
  return (
    <button type="button" disabled={busy} onClick={() => cancel()} className="mt-2 text-[var(--color-accent)] underline disabled:opacity-40">
      Cancel
    </button>
  );
}
