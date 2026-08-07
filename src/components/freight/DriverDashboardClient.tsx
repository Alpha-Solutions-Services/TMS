"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  Loader2,
  MapPin,
  MessageSquare,
  RefreshCw,
  Upload,
} from "lucide-react";
import { PortalClock } from "@/components/freight/PortalClock";
import { useAutoRefresh } from "@/lib/hooks/useAutoRefresh";

type DriverLoad = {
  id: string;
  load_number: string;
  pickup: string;
  delivery: string;
  rate: number;
  status: string;
  miles: number;
  broker: string;
  carrier: string;
  documents: {
    rate_con: boolean;
    bol: boolean;
    commodity: boolean;
    pod: boolean;
  };
  document_urls: {
    rate_con: string | null;
    bol: string | null;
    commodity: string | null;
    pod: string | null;
  };
};

type DriverDashboardPayload = {
  driver: { name: string; company: string };
  loads: DriverLoad[];
  generated_at: string;
};

const UPLOAD_TYPES = [
  { key: "bol" as const, label: "BOL" },
  { key: "commodity" as const, label: "Commodity photo" },
  { key: "pod" as const, label: "POD" },
];

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function isDelivered(status: string) {
  const v = status.toLowerCase();
  return (
    v.includes("deliver") ||
    v === "completed" ||
    v === "complete" ||
    v === "paid"
  );
}

export function DriverDashboardClient() {
  const [data, setData] = useState<DriverDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "delivered">("active");
  const [locBusy, setLocBusy] = useState(false);

  const refresh = useCallback(async (soft = false) => {
    if (!soft) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch("/api/driver/dashboard", { cache: "no-store" });
      const json = (await res.json()) as DriverDashboardPayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
      setError(null);
    } catch (e) {
      if (!soft) setError(e instanceof Error ? e.message : "Error");
    } finally {
      if (!soft) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  useAutoRefresh(() => refresh(true), { intervalMs: 20000 });

  const { activeLoads, deliveredLoads } = useMemo(() => {
    const loads = data?.loads ?? [];
    return {
      activeLoads: loads.filter((l) => !isDelivered(l.status)),
      deliveredLoads: loads.filter((l) => isDelivered(l.status)),
    };
  }, [data]);

  const visible = tab === "active" ? activeLoads : deliveredLoads;

  async function uploadDoc(loadId: string, type: "bol" | "commodity" | "pod", file: File) {
    setUploading(`${loadId}-${type}`);
    try {
      const form = new FormData();
      form.set("loadId", loadId);
      form.set("type", type);
      form.set("file", file);
      const res = await fetch("/api/freight/loads/documents", { method: "POST", body: form });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setMsg(`${type.toUpperCase()} uploaded.`);
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      setMsg(message);
      alert(message);
    } finally {
      setUploading(null);
    }
  }

  async function markDelivered(loadId: string) {
    if (!confirm("Mark this load as delivered?")) return;
    setBusyId(loadId);
    setMsg(null);
    try {
      const res = await fetch(`/api/freight/driver/loads/${loadId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Delivered" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setMsg("Load marked delivered.");
      setTab("delivered");
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function shareLocation(loadId?: string) {
    if (!navigator.geolocation) {
      setMsg("Location not supported on this device.");
      return;
    }
    setLocBusy(true);
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch("/api/freight/driver/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracyM: pos.coords.accuracy,
              loadId: loadId || null,
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Failed");
          setMsg("Location shared with dispatch.");
        } catch (e) {
          setMsg(e instanceof Error ? e.message : "Could not share location");
        } finally {
          setLocBusy(false);
        }
      },
      () => {
        setMsg("Location permission denied.");
        setLocBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-muted)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading your loads…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center">
        <p className="text-red-300">{error}</p>
        <button type="button" onClick={() => void refresh()} className="mt-4 rounded-lg border px-4 py-2 text-sm">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4 p-3 pb-8 sm:space-y-6 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-[var(--color-accent)]">Driver cockpit</p>
          <h1 className="mt-1 truncate text-xl font-bold text-[var(--color-text)] sm:text-2xl">{data.driver.name}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{data.driver.company}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PortalClock compact />
          <button
            type="button"
            disabled={locBusy}
            onClick={() => void shareLocation(activeLoads[0]?.id)}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-40"
          >
            {locBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            Share location
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </header>
      <p className="text-xs text-[var(--color-muted)]">
        Keep this app open to share GPS automatically when dispatch requests live location
        (location permission must be allowed once).
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("active")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            tab === "active"
              ? "bg-[var(--color-accent)] text-[#05080f]"
              : "border border-[var(--color-border)] text-[var(--color-muted)]"
          }`}
        >
          My loads ({activeLoads.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("delivered")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            tab === "delivered"
              ? "bg-[var(--color-accent)] text-[#05080f]"
              : "border border-[var(--color-border)] text-[var(--color-muted)]"
          }`}
        >
          Delivered ({deliveredLoads.length})
        </button>
      </div>

      {msg ? (
        <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 px-3 py-2 text-xs text-[var(--color-muted)]">
          {msg}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-border)] px-4 py-10 text-center text-[var(--color-muted)]">
          {tab === "active"
            ? "No active loads. Dispatch will assign trips from the portal."
            : "No delivered loads yet."}
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((load) => (
            <div
              key={load.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-[var(--color-accent)]">
                    {tab === "delivered" ? "Delivered load" : "Assigned load"}
                  </p>
                  <p className="text-lg font-semibold text-[var(--color-text)]">Load {load.load_number}</p>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">
                    {load.pickup} → {load.delivery}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    {load.broker} · {formatUsd(load.rate)} · {load.status}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/driver/chat?load=${encodeURIComponent(load.id)}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[#05080f]"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Chat
                  </Link>
                  {tab === "active" ? (
                    <button
                      type="button"
                      disabled={busyId === load.id}
                      onClick={() => void markDelivered(load.id)}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-40"
                    >
                      {busyId === load.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Mark delivered
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={locBusy}
                    onClick={() => void shareLocation(load.id)}
                    className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted)]"
                  >
                    <MapPin className="h-4 w-4" />
                    Ping GPS
                  </button>
                  {load.documents.rate_con && load.document_urls.rate_con ? (
                    <a
                      href={load.document_urls.rate_con}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-accent)]/40 px-3 py-2 text-xs text-[var(--color-accent)]"
                    >
                      <Download className="h-4 w-4" />
                      Rate confirmation
                    </a>
                  ) : (
                    <span className="text-xs text-[var(--color-muted)]">Rate con pending</span>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {UPLOAD_TYPES.map(({ key, label }) => (
                  <div key={key} className="rounded-xl border border-[var(--color-border)] p-3">
                    <p className="text-xs font-medium text-[var(--color-text)]">{label}</p>
                    {load.documents[key] && load.document_urls[key] ? (
                      <a
                        href={load.document_urls[key]!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--color-accent)]"
                      >
                        <Download className="h-3 w-3" />
                        View uploaded
                      </a>
                    ) : (
                      <p className="mt-1 text-[10px] text-[var(--color-muted)]">Not uploaded</p>
                    )}
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]">
                      {uploading === `${load.id}-${key}` ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Upload className="h-3 w-3" />
                      )}
                      Upload
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        className="hidden"
                        disabled={Boolean(uploading)}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadDoc(load.id, key, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
