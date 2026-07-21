"use client";

import { useEffect, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import type { DashboardLoad } from "@/lib/freight/dispatch-dashboard-types";

type DriverOption = { id: string; name: string; email: string };

export function LoadAssignModal({
  load,
  onClose,
  onSaved,
}: {
  load: DashboardLoad;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [driverId, setDriverId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rateConFile, setRateConFile] = useState<File | null>(null);

  useEffect(() => {
    async function loadDrivers() {
      const qs = new URLSearchParams({ all: "1" });
      if (load.carrier) qs.set("companyName", load.carrier);
      const res = await fetch(`/api/dispatcher/carrier-drivers?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { drivers?: DriverOption[]; error?: string };
      if (!res.ok) {
        setMsg(json.error ?? "Could not load drivers");
        setDrivers([]);
        return;
      }
      setDrivers(json.drivers ?? []);
      if (json.drivers?.[0]) setDriverId(json.drivers[0].id);
    }
    void loadDrivers();
  }, [load.carrier]);

  async function save() {
    if (!load.db_id) {
      setMsg("Load must be saved in Supabase first.");
      return;
    }
    if (!driverId) {
      setMsg("Select a driver to assign.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const patchRes = await fetch("/api/dispatcher/loads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: load.db_id,
          assignedDriverProfileId: driverId || null,
        }),
      });
      const patchJson = (await patchRes.json()) as { error?: string };
      if (!patchRes.ok) throw new Error(patchJson.error ?? "Assign failed");

      if (rateConFile) {
        const form = new FormData();
        form.set("loadId", load.db_id);
        form.set("type", "rate_con");
        form.set("file", rateConFile);
        const upRes = await fetch("/api/freight/loads/documents", {
          method: "POST",
          body: form,
        });
        const upJson = (await upRes.json()) as { error?: string };
        if (!upRes.ok) throw new Error(upJson.error ?? "Rate con upload failed");
      }

      setMsg("Driver assigned — notifications sent.");
      await onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-3 text-xl text-[var(--color-muted)]"
        >
          ×
        </button>
        <h3 className="text-lg font-bold text-[var(--color-text)]">Assign load</h3>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Load {load.load_number !== "—" ? load.load_number : load.sr} · {load.carrier}
        </p>

        <label className="mt-5 block text-xs text-[var(--color-muted)]">Driver</label>
        <select
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
        >
          <option value="">— Unassigned —</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} {d.email ? `(${d.email})` : ""}
            </option>
          ))}
        </select>
        {drivers.length === 0 ? (
          <p className="mt-2 text-xs text-amber-300">
            No drivers in the system yet. Invite a driver from Drivers, then assign.
          </p>
        ) : (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Matching carrier drivers appear first; all drivers are listed so you can always assign.
          </p>
        )}

        <label className="mt-5 block text-xs text-[var(--color-muted)]">
          Rate confirmation (sent to driver)
        </label>
        <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-3 text-sm text-[var(--color-muted)] hover:border-[var(--color-accent)]/50">
          <Upload className="h-4 w-4" />
          {rateConFile ? rateConFile.name : "Choose PDF or image…"}
          <input
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={(e) => setRateConFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] py-3 text-sm font-bold text-[#05080f] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save assignment
        </button>
        {msg ? <p className="mt-3 text-xs text-[var(--color-muted)]">{msg}</p> : null}
      </div>
    </div>
  );
}
