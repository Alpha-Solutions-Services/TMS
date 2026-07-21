"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { LoadPasteParser } from "@/components/freight/LoadPasteParser";
import { FreightAiAssistant } from "@/components/freight/FreightAiAssistant";
import type { DashboardLoad } from "@/lib/freight/dispatch-dashboard-types";
import { computeBalance, computeDispatchFee } from "@/lib/freight/load-notifications";

export type LoadFormValues = {
  bookedBy: string;
  rcDate: string;
  truckTrailer: string;
  companyName: string;
  broker: string;
  loadDetails: string;
  pickupDateTime: string;
  deliveryDateTime: string;
  miles: string;
  loadNumber: string;
  states: string;
  rcInvoice: string;
  dispatchPercent: string;
  dispatchFee: string;
  invoice: string;
  received: string;
  balance: string;
  notes: string;
  claim: string;
  status: string;
  cpay: string;
  dtp: string;
  brokerAgentName: string;
  email: string;
  phone: string;
};

const FIELD_ROWS: { key: keyof LoadFormValues; label: string; required?: boolean; type?: string }[] = [
  { key: "bookedBy", label: "Booked By" },
  { key: "rcDate", label: "RC Date" },
  { key: "truckTrailer", label: "Truck & Trailer" },
  { key: "companyName", label: "Company Name", required: true },
  { key: "broker", label: "Broker" },
  { key: "loadDetails", label: "Load Details / Lane" },
  { key: "pickupDateTime", label: "Pickup Date & Time" },
  { key: "deliveryDateTime", label: "Delivery Date & Time" },
  { key: "miles", label: "Miles", type: "number" },
  { key: "loadNumber", label: "Load #" },
  { key: "states", label: "States" },
  { key: "rcInvoice", label: "RC-Invoice ($)", type: "number" },
  { key: "dispatchPercent", label: "Dispatch %", type: "number" },
  { key: "dispatchFee", label: "Dispatch Fee ($)", type: "number" },
  { key: "invoice", label: "Invoice" },
  { key: "received", label: "Received ($)", type: "number" },
  { key: "balance", label: "Balance ($)", type: "number" },
  { key: "notes", label: "Notes" },
  { key: "claim", label: "Claim" },
  { key: "status", label: "Status" },
  { key: "cpay", label: "CPAY" },
  { key: "dtp", label: "DTP" },
  { key: "brokerAgentName", label: "Broker Agent Name" },
  { key: "email", label: "Email (carrier notifications)", type: "email" },
  { key: "phone", label: "Phone" },
];

function dash(v: string) {
  return v === "—" ? "" : v;
}

export function emptyLoadForm(defaultBookedBy = ""): LoadFormValues {
  return {
    bookedBy: defaultBookedBy,
    rcDate: new Date().toLocaleDateString("en-US"),
    truckTrailer: "",
    companyName: "",
    broker: "",
    loadDetails: "",
    pickupDateTime: "",
    deliveryDateTime: "",
    miles: "",
    loadNumber: "",
    states: "",
    rcInvoice: "",
    dispatchPercent: "5",
    dispatchFee: "",
    invoice: "Pending",
    received: "0",
    balance: "",
    notes: "",
    claim: "",
    status: "Unpaid",
    cpay: "",
    dtp: "",
    brokerAgentName: "",
    email: "",
    phone: "",
  };
}

export function loadToFormValues(load: DashboardLoad): LoadFormValues {
  return {
    bookedBy: dash(load.booked_by),
    rcDate: dash(load.rc_date),
    truckTrailer: dash(load.truck_trailer),
    companyName: dash(load.carrier),
    broker: dash(load.broker),
    loadDetails: dash(load.load_details),
    pickupDateTime: dash(load.pickup),
    deliveryDateTime: dash(load.delivery),
    miles: load.miles ? String(load.miles) : "",
    loadNumber: dash(load.load_number),
    states: dash(load.states),
    rcInvoice: load.rate ? String(load.rate) : "",
    dispatchPercent: load.dispatch_percent ? String(load.dispatch_percent) : "5",
    dispatchFee: load.dispatch_fee ? String(load.dispatch_fee) : "",
    invoice: dash(load.invoice_status),
    received: String(load.received ?? 0),
    balance: load.balance ? String(load.balance) : "",
    notes: dash(load.notes),
    claim: dash(load.claim),
    status: dash(load.status) || "Unpaid",
    cpay: dash(load.cpay),
    dtp: dash(load.dtp),
    brokerAgentName: dash(load.broker_agent),
    email: dash(load.email),
    phone: dash(load.phone),
  };
}

function parseNum(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

export function formValuesToPayload(form: LoadFormValues, monthTab: string) {
  const rcInvoice = parseNum(form.rcInvoice) ?? 0;
  const dispatchPercent = parseNum(form.dispatchPercent) ?? 5;
  const dispatchFee = parseNum(form.dispatchFee);
  const fee = computeDispatchFee(rcInvoice, dispatchPercent, dispatchFee);
  const received = parseNum(form.received) ?? 0;
  const balance = parseNum(form.balance) ?? computeBalance(fee, received);

  return {
    monthTab,
    companyName: form.companyName.trim(),
    bookedBy: form.bookedBy.trim() || undefined,
    rcDate: form.rcDate.trim() || undefined,
    truckTrailer: form.truckTrailer.trim() || undefined,
    broker: form.broker.trim() || undefined,
    loadDetails: form.loadDetails.trim() || undefined,
    pickupDateTime: form.pickupDateTime.trim() || undefined,
    deliveryDateTime: form.deliveryDateTime.trim() || undefined,
    miles: parseNum(form.miles),
    loadNumber: form.loadNumber.trim() || undefined,
    states: form.states.trim() || undefined,
    rcInvoice,
    dispatchPercent,
    dispatchFee: fee,
    invoice: form.invoice.trim() || undefined,
    received,
    balance,
    notes: form.notes.trim() || undefined,
    claim: form.claim.trim() || undefined,
    status: form.status.trim() || "Unpaid",
    cpay: form.cpay.trim() || undefined,
    dtp: form.dtp.trim() || undefined,
    brokerAgentName: form.brokerAgentName.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
  };
}

export function LoadFormPanel({
  mode,
  monthTab,
  load,
  defaultBookedBy,
  variant = "modal",
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  monthTab: string;
  load?: DashboardLoad;
  defaultBookedBy?: string;
  variant?: "modal" | "inline";
  onClose?: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [form, setForm] = useState<LoadFormValues>(() =>
    mode === "edit" && load ? loadToFormValues(load) : emptyLoadForm(defaultBookedBy),
  );
  const [carrierPreview, setCarrierPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const computedFee = useMemo(() => {
    const rc = parseNum(form.rcInvoice) ?? 0;
    const pct = parseNum(form.dispatchPercent) ?? 5;
    const manual = parseNum(form.dispatchFee);
    return computeDispatchFee(rc, pct, manual);
  }, [form.rcInvoice, form.dispatchPercent, form.dispatchFee]);

  const computedBalance = useMemo(() => {
    const received = parseNum(form.received) ?? 0;
    return computeBalance(computedFee, received);
  }, [computedFee, form.received]);

  async function save() {
    if (!form.companyName.trim()) {
      setMsg("Company name is required.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const payload = formValuesToPayload(form, monthTab);
      const res = await fetch("/api/dispatcher/loads", {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "edit" && load?.db_id ? { id: load.db_id, ...payload } : payload,
        ),
      });
      const json = (await res.json()) as {
        error?: string;
        sr?: number;
        carrierNotified?: boolean;
        dispatcherNotified?: boolean;
        pendingApproval?: boolean;
        message?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Save failed");

      if (json.pendingApproval) {
        await onSaved(
          json.message ??
            "Submitted for super dispatcher approval — you'll be notified when approved.",
        );
        return;
      }

      const parts: string[] = [];
      if (mode === "create") parts.push(`Load saved (SR-${json.sr}).`);
      else parts.push("Load updated.");

      if (json.carrierNotified) parts.push("Carrier emailed.");
      else if (form.email.trim()) parts.push("Carrier email failed — check SMTP.");
      else parts.push("Add carrier Email on load to enable carrier notifications.");

      if (json.dispatcherNotified) parts.push("Dispatch notified.");
      else parts.push("Dispatch notification skipped — no dispatcher email.");

      await onSaved(parts.join(" "));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save load");
    } finally {
      setBusy(false);
    }
  }

  const formBody = (
    <>
      <h2 className="text-lg font-bold text-[var(--color-text)]">
        {mode === "create" ? "New load" : `Edit load SR-${load?.sr ?? ""}`}
      </h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        {mode === "create"
          ? "SR# is assigned automatically. Saves to Supabase — carrier portal updates instantly. Emails carrier (if Email is set) + dispatch team."
          : "Saves to Supabase — reflected instantly on the carrier portal."}
      </p>

      {mode === "create" ? (
        <>
          <LoadPasteParser
            onApply={(fields, summary) => {
              setForm((f) => ({ ...f, ...fields }));
              if (summary) setCarrierPreview(summary);
            }}
          />
          <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-3">
            <p className="mb-2 text-xs font-semibold text-[var(--color-accent)]">Or upload RC / BOL (AI extract)</p>
            <FreightAiAssistant
              embedded
              allowFiles
              onLoadFieldsExtracted={(fields, summary) => {
                setForm((f) => ({ ...f, ...fields }));
                setCarrierPreview(summary);
              }}
            />
          </div>
        </>
      ) : null}

      {carrierPreview ? (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-xs font-semibold uppercase text-emerald-300">Carrier summary (copy to chat)</p>
          <pre className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-text)]">{carrierPreview}</pre>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {FIELD_ROWS.map(({ key, label, required, type }) => (
          <label key={key} className="block text-xs">
            <span className="text-[var(--color-muted)]">
              {label}
              {required ? " *" : ""}
            </span>
            <input
              type={type ?? "text"}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm text-[var(--color-text)]"
            />
          </label>
        ))}
      </div>

      <p className="mt-2 text-[10px] text-[var(--color-muted)]">
        Calculated dispatch fee: ${computedFee.toFixed(2)} · Balance: ${computedBalance.toFixed(2)} (used on save if left blank)
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === "create" ? "Save load" : "Save changes"}
        </button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm"
          >
            Cancel
          </button>
        ) : null}
      </div>
      {msg ? <p className="mt-3 text-sm text-red-300">{msg}</p> : null}
    </>
  );

  if (variant === "inline") {
    return (
      <div className="rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-surface)]/50 p-5">
        {formBody}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8">
      <div className="relative w-full max-w-5xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        {onClose ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-4 top-3 text-xl text-[var(--color-muted)]"
          >
            ×
          </button>
        ) : null}
        {formBody}
      </div>
    </div>
  );
}

/** @deprecated use LoadFormPanel */
export function LoadFormModal(props: {
  mode: "create" | "edit";
  monthTab: string;
  load?: DashboardLoad;
  defaultBookedBy?: string;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  return <LoadFormPanel {...props} variant="modal" />;
}
