"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PaymentPreference = "factoring" | "quick_pay";

type EligibleCarrier = {
  id: string;
  company_name: string | null;
  full_name: string | null;
  mc_number: string | null;
  carrier_payment_preference: PaymentPreference | null;
  carrier_status: string | null;
};

const BASE_DOCS: { value: string; label: string }[] = [
  { value: "mc_authority", label: "MC Authority Letter" },
  { value: "w9", label: "W-9 Form" },
  { value: "coi", label: "Certificate of Insurance" },
];

const PAY_DOC: Record<PaymentPreference, { value: string; label: string }> = {
  factoring: { value: "factoring_noa", label: "Notice of Assignment (factoring)" },
  quick_pay: { value: "voided_check", label: "Voided Check (quick pay)" },
};

export function DispatcherStaffDocUpload() {
  const [carriers, setCarriers] = useState<EligibleCarrier[]>([]);
  const [carrierId, setCarrierId] = useState("");
  const [docType, setDocType] = useState("mc_authority");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadCarriers = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        "/api/freight/dispatcher/carrier-documents?list=carriers",
        { cache: "no-store", credentials: "same-origin" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not load carriers");
      setCarriers((json.carriers ?? []) as EligibleCarrier[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCarriers();
  }, [loadCarriers]);

  const selected = useMemo(
    () => carriers.find((c) => c.id === carrierId) ?? null,
    [carriers, carrierId],
  );

  const docOptions = useMemo(() => {
    const opts = [...BASE_DOCS];
    const pref = selected?.carrier_payment_preference;
    if (pref && PAY_DOC[pref]) opts.push(PAY_DOC[pref]);
    return opts;
  }, [selected]);

  useEffect(() => {
    if (!docOptions.some((o) => o.value === docType)) {
      setDocType(docOptions[0]?.value ?? "mc_authority");
    }
  }, [docOptions, docType]);

  async function submit() {
    if (!carrierId) {
      setErr("Select a carrier.");
      return;
    }
    if (!file) {
      setErr("Choose a file.");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("carrierProfileId", carrierId);
      fd.set("documentType", docType);
      fd.set("file", file);
      const res = await fetch("/api/freight/dispatcher/carrier-documents", {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setMsg(
        "Uploaded — pending review. Four-eyes: another reviewer must approve it.",
      );
      setFile(null);
      setFileKey((k) => k + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5 sm:p-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)]">
        Upload documents on behalf of a carrier
      </h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Super can upload for any carrier; dispatchers for carriers assigned to
        them. Uploaded docs go to pending — you can&apos;t approve a document you
        uploaded (four-eyes).
      </p>

      {err ? <p className="mt-4 text-xs text-red-200">{err}</p> : null}
      {msg ? <p className="mt-4 text-xs text-emerald-200">{msg}</p> : null}

      {loading ? (
        <p className="mt-4 text-xs text-[var(--color-muted)]">
          Loading carriers…
        </p>
      ) : carriers.length === 0 ? (
        <p className="mt-4 text-xs text-[var(--color-muted)]">
          No carriers available for upload.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="text-[var(--color-muted)]">Carrier</span>
            <select
              value={carrierId}
              onChange={(e) => setCarrierId(e.target.value)}
              className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
            >
              <option value="">Select carrier…</option>
              {carriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.company_name || c.full_name || "Carrier") +
                    (c.mc_number ? ` · MC ${c.mc_number}` : "")}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs">
            <span className="text-[var(--color-muted)]">Document type</span>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
            >
              {docOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs sm:col-span-2">
            <span className="text-[var(--color-muted)]">
              File (PDF or image, max 10MB)
            </span>
            <input
              key={fileKey}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-xs text-[var(--color-muted)]"
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-50"
            >
              {busy ? "Uploading…" : "Upload document"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
