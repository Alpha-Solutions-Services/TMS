"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { FileDown, Loader2, Mail, Send, Trash2 } from "lucide-react";
import { DispatchMonthSelector } from "@/components/freight/DispatchMonthSelector";
import { PortalClock, useLiveNow } from "@/components/freight/PortalClock";
import { useDispatchDashboard } from "@/components/freight/useDispatchDashboard";
import {
  assignDefaultInvoiceNumbers,
} from "@/lib/freight/dispatch-invoice-service";
import {
  formatInvoiceDate,
  getInvoiceFriday,
  groupLoadsByCarrier,
  isInvoiceableLoad,
  computeOutstandingDispatchFee,
} from "@/lib/freight/dispatch-invoice";
import { buildCarrierContactIndex, resolveCarrierEmail } from "@/lib/freight/carrier-contact";
import {
  INVOICE_PAYMENT_OPTIONS,
  type InvoicePaymentMethod,
} from "@/lib/freight/dispatch-invoice-payment";
import type { SentInvoiceRecord } from "@/lib/freight/dispatch-sent-invoices-db";

const PAYMENT_PREVIEW: Record<InvoicePaymentMethod, string> = {
  s_zelle: "Suzy Agon · +1 (908) 848-9815",
  m_zelle: "Maliha Shahid · (332) 263-3544 · malihaawais1997@gmail.com",
};

type PageTab = "create" | "sent";

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function statusBadge(status: SentInvoiceRecord["paymentStatus"]) {
  if (status === "paid") return "bg-emerald-500/15 text-emerald-300";
  if (status === "partial") return "bg-amber-500/15 text-amber-300";
  return "bg-red-500/15 text-red-300";
}

export function DispatcherInvoicesPage() {
  const { data, loading, error, activeTab, changeTab, refresh } = useDispatchDashboard();
  const searchParams = useSearchParams();
  const generateMode = searchParams.get("action") === "generate";
  const tabParam = searchParams.get("tab");
  const [pageTab, setPageTab] = useState<PageTab>(
    tabParam === "sent" ? "sent" : "create",
  );

  useEffect(() => {
    if (tabParam === "sent") setPageTab("sent");
    if (tabParam === "create") setPageTab("create");
  }, [tabParam]);
  const [selectedCarriers, setSelectedCarriers] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<InvoicePaymentMethod>("s_zelle");
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState(1);
  const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string>>({});
  const [sentInvoices, setSentInvoices] = useState<SentInvoiceRecord[]>([]);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentError, setSentError] = useState<string | null>(null);
  const [partialAmounts, setPartialAmounts] = useState<Record<string, string>>({});

  const now = useLiveNow(60_000);
  const friday = useMemo(() => getInvoiceFriday(now), [now]);
  const fridayLabel = formatInvoiceDate(friday);

  const billedKeys = useMemo(() => {
    const dbIds = new Set<string>();
    const loadNumbers = new Set<string>();
    const carrierSrs = new Set<string>();
    for (const inv of sentInvoices) {
      const carrier = inv.carrierName.trim().toLowerCase();
      for (const li of inv.lineItems) {
        if (li.db_id) dbIds.add(li.db_id);
        if (li.load_number) loadNumbers.add(li.load_number.trim());
        if (li.sr && carrier) carrierSrs.add(`${carrier}::${li.sr}`);
      }
    }
    return { dbIds, loadNumbers, carrierSrs };
  }, [sentInvoices]);

  const carrierGroups = useMemo(() => {
    if (!data) return [];
    const rosterIndex = buildCarrierContactIndex(data.carrier_roster);
    const openLoads = data.loads.filter((load) => {
      if (!isInvoiceableLoad(load)) return false;
      if (load.db_id && billedKeys.dbIds.has(load.db_id)) return false;
      if (
        load.load_number &&
        load.load_number !== "—" &&
        billedKeys.loadNumbers.has(load.load_number.trim())
      ) {
        return false;
      }
      const carrier = load.carrier.trim().toLowerCase();
      if (carrier && load.sr && billedKeys.carrierSrs.has(`${carrier}::${load.sr}`)) {
        return false;
      }
      return true;
    });
    const grouped = groupLoadsByCarrier(openLoads);

    return Array.from(grouped.entries()).map(([carrier, loads]) => {
      const email = resolveCarrierEmail(loads, rosterIndex);
      const total = loads.reduce(
        (s, load) => s + computeOutstandingDispatchFee(load),
        0,
      );
      return {
        carrier,
        loads,
        email,
        loadNumbers: loads
          .map((l) => (l.load_number !== "—" ? l.load_number : `SR-${l.sr}`))
          .join(", "),
        total: Math.round(total * 100) / 100,
        lineCount: loads.length,
      };
    });
  }, [data, billedKeys]);

  useEffect(() => {
    if (carrierGroups.length === 0) return;
    setInvoiceNumbers((prev) => {
      const defaults = assignDefaultInvoiceNumbers(
        carrierGroups.map((g) => g.carrier),
        nextInvoiceNumber,
      );
      const next = { ...defaults };
      for (const group of carrierGroups) {
        if (prev[group.carrier]?.trim()) {
          next[group.carrier] = prev[group.carrier];
        }
      }
      return next;
    });
  }, [carrierGroups, nextInvoiceNumber]);

  const loadSentInvoices = useCallback(async () => {
    setSentLoading(true);
    setSentError(null);
    try {
      // Load all months so a send always appears on Sent (not hidden by wrong month filter).
      const res = await fetch("/api/dispatcher/invoices/sent?tab=all");
      const body = (await res.json()) as {
        error?: string;
        invoices?: SentInvoiceRecord[];
        nextInvoiceNumber?: number;
      };
      if (!res.ok) throw new Error(body.error ?? "Could not load sent invoices");
      setSentInvoices(body.invoices ?? []);
      if (body.nextInvoiceNumber) setNextInvoiceNumber(body.nextInvoiceNumber);
    } catch (e) {
      setSentError(e instanceof Error ? e.message : "Could not load sent invoices");
    } finally {
      setSentLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSentInvoices();
  }, [loadSentInvoices]);

  if (loading && !data) return <p className="p-8 text-[var(--color-muted)]">Loading invoices…</p>;
  if (error && !data) return <p className="p-8 text-red-300">{error}</p>;
  if (!data) return null;

  function toggleCarrier(carrier: string) {
    setSelectedCarriers((prev) => {
      const next = new Set(prev);
      if (next.has(carrier)) next.delete(carrier);
      else next.add(carrier);
      return next;
    });
  }

  function selectAll() {
    setSelectedCarriers(new Set(carrierGroups.map((g) => g.carrier)));
  }

  function invoiceNumbersForCarriers(carriers: string[]) {
    const map: Record<string, string> = {};
    for (const carrier of carriers) {
      const value = invoiceNumbers[carrier]?.trim();
      if (value) map[carrier] = value;
    }
    return map;
  }

  const selectedTotal = carrierGroups
    .filter((g) => selectedCarriers.has(g.carrier))
    .reduce((s, g) => s + g.total, 0);

  async function downloadPdfInvoices(carriers?: string[]) {
    setGenerating(true);
    setGenError(null);
    setSendSuccess(null);
    try {
      const carrierList = carriers?.length ? carriers : undefined;
      const res = await fetch("/api/dispatcher/invoices/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tab: activeTab,
          carriers: carrierList,
          paymentMethod,
          invoiceNumbers: carrierList ? invoiceNumbersForCarriers(carrierList) : invoiceNumbersForCarriers(carrierGroups.map((g) => g.carrier)),
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed (${res.status})`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename =
        match?.[1] ??
        (blob.type.includes("zip")
          ? `dispatch-invoices-${friday.toISOString().slice(0, 10)}.zip`
          : `Invoice.pdf`);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Could not generate invoices");
    } finally {
      setGenerating(false);
    }
  }

  async function sendInvoices(carriers?: string[]) {
    setSending(true);
    setGenError(null);
    setSendSuccess(null);
    try {
      const carrierList = carriers?.length ? carriers : undefined;
      const res = await fetch("/api/dispatcher/invoices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tab: activeTab,
          carriers: carrierList,
          paymentMethod,
          invoiceNumbers: carrierList ? invoiceNumbersForCarriers(carrierList) : invoiceNumbersForCarriers(carrierGroups.map((g) => g.carrier)),
        }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: number;
        failed?: number;
        results?: { carrier: string; ok: boolean; error?: string }[];
      };

      if (!res.ok) {
        throw new Error(body.error ?? `Failed (${res.status})`);
      }

      const failed = body.results?.filter((r) => !r.ok) ?? [];
      if (failed.length) {
        setSendSuccess(
          `Sent ${body.sent ?? 0} invoice(s). ${failed.length} failed: ${failed
            .map((f) => `${f.carrier}${f.error ? ` (${f.error})` : ""}`)
            .join("; ")}`,
        );
      } else {
        setSendSuccess(`Sent ${body.sent ?? 0} invoice email(s) with PDF attached.`);
      }
      setPageTab("sent");
      await loadSentInvoices();
      await refresh(activeTab);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Could not send invoices");
    } finally {
      setSending(false);
    }
  }

  async function updateSentPayment(
    invoice: SentInvoiceRecord,
    paymentStatus: SentInvoiceRecord["paymentStatus"],
  ) {
    setSentError(null);
    try {
      const body: Record<string, unknown> = { id: invoice.id, paymentStatus };
      if (paymentStatus === "partial") {
        const raw = partialAmounts[invoice.id] ?? String(invoice.amountReceived || invoice.amountTotal / 2);
        body.amountReceived = Number.parseFloat(raw);
        if (!Number.isFinite(body.amountReceived as number) || (body.amountReceived as number) <= 0) {
          setSentError("Enter a valid partial amount received");
          return;
        }
      }

      const res = await fetch("/api/dispatcher/invoices/sent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as { error?: string; invoice?: SentInvoiceRecord };
      if (!res.ok) throw new Error(payload.error ?? "Update failed");
      await loadSentInvoices();
      await refresh(activeTab);
    } catch (e) {
      setSentError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function deleteSentInvoice(id: string) {
    if (!window.confirm("Remove this sent invoice record?")) return;
    setSentError(null);
    try {
      const res = await fetch(`/api/dispatcher/invoices/sent?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Delete failed");
      await loadSentInvoices();
    } catch (e) {
      setSentError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const busy = generating || sending;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold text-[var(--color-text)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Invoices
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Weekly carrier invoices — issued Fridays · due {fridayLabel}
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Next invoice number: <strong className="text-[var(--color-text)]">{nextInvoiceNumber}</strong>
            {" · "}Edit invoice # per carrier before send or download.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-4">
          <DispatchMonthSelector
            value={activeTab}
            options={data.sheet_meta.available_tabs}
            onChange={changeTab}
            disabled={loading}
          />
          <PortalClock compact />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[var(--color-border)] pb-1">
        <button
          type="button"
          onClick={() => setPageTab("create")}
          className={clsx(
            "rounded-t-lg px-4 py-2 text-sm font-medium transition",
            pageTab === "create"
              ? "border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"
              : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
          )}
        >
          Create & send
        </button>
        <button
          type="button"
          onClick={() => setPageTab("sent")}
          className={clsx(
            "rounded-t-lg px-4 py-2 text-sm font-medium transition",
            pageTab === "sent"
              ? "border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"
              : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
          )}
        >
          Sent invoices ({sentInvoices.length})
        </button>
      </div>

      {pageTab === "create" ? (
        <>
          <div className="rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-surface)]/50 p-5">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Generate & send invoices</h2>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Choose one payment method per batch — only that option appears on the PDF and email.
            </p>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Payment method
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {INVOICE_PAYMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPaymentMethod(opt.value)}
                    className={clsx(
                      "rounded-xl border px-4 py-2 text-sm font-medium transition",
                      paymentMethod === opt.value
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                        : "border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)]/40",
                    )}
                  >
                    {opt.shortLabel}
                  </button>
                ))}
              </div>
              <p className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-2 text-xs text-[var(--color-muted)]">
                {PAYMENT_PREVIEW[paymentMethod]}
              </p>
            </div>

            {generateMode && carrierGroups.length > 0 && selectedCarriers.size === 0 ? (
              <button
                type="button"
                onClick={selectAll}
                className="mt-3 text-xs text-[var(--color-accent)] hover:underline"
              >
                Select all carriers with invoiceable loads
              </button>
            ) : null}

            <p className="mt-3 text-lg font-bold text-orange-300">
              Selected total: {formatUsd(selectedTotal)}
              {selectedCarriers.size > 0 ? ` · ${selectedCarriers.size} carrier(s)` : ""}
            </p>

            {genError ? <p className="mt-2 text-sm text-red-300">{genError}</p> : null}
            {sendSuccess ? <p className="mt-2 text-sm text-emerald-400">{sendSuccess}</p> : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy || selectedCarriers.size === 0}
                onClick={() => void sendInvoices(Array.from(selectedCarriers))}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-40"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send selected
              </button>
              <button
                type="button"
                disabled={busy || selectedCarriers.size === 0}
                onClick={() => void downloadPdfInvoices(Array.from(selectedCarriers))}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-40"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                Download PDF{selectedCarriers.size > 1 ? "s (ZIP)" : ""}
              </button>
              <button
                type="button"
                disabled={busy || carrierGroups.length === 0}
                onClick={() => void sendInvoices()}
                className="rounded-xl border border-emerald-500/40 px-4 py-2 text-sm text-emerald-300 disabled:opacity-40"
              >
                Send all Friday invoices
              </button>
              <button
                type="button"
                disabled={busy || carrierGroups.length === 0}
                onClick={() => void downloadPdfInvoices()}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] disabled:opacity-40"
              >
                Download all
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--color-surface)]/80 text-xs uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3">Select</th>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Carrier</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Load #</th>
                  <th className="px-4 py-3">Loads</th>
                  <th className="px-4 py-3">Dispatch total</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Send</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {carrierGroups.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-[var(--color-muted)]">
                      No unpaid loads to invoice. Paid rows (STATUS = Paid) are excluded; partial
                      payments use the remaining balance only.
                    </td>
                  </tr>
                ) : (
                  carrierGroups.map((group) => (
                    <tr key={group.carrier} className="hover:bg-[var(--color-accent-dim)]/20">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedCarriers.has(group.carrier)}
                          onChange={() => toggleCarrier(group.carrier)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={invoiceNumbers[group.carrier] ?? ""}
                          onChange={(e) =>
                            setInvoiceNumbers((prev) => ({
                              ...prev,
                              [group.carrier]: e.target.value,
                            }))
                          }
                          className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 tabular-nums text-[var(--color-accent)]"
                          aria-label={`Invoice number for ${group.carrier}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                        {group.carrier}
                      </td>
                      <td
                        className="max-w-[180px] truncate px-4 py-3 text-[var(--color-muted)]"
                        title={group.email}
                      >
                        {group.email || (
                          <span className="text-red-300" title="Add email on Carriers tab or dispatch Email column">
                            Missing
                          </span>
                        )}
                      </td>
                      <td
                        className="max-w-xs truncate px-4 py-3 text-[var(--color-muted)]"
                        title={group.loadNumbers}
                      >
                        {group.loadNumbers}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{group.lineCount}</td>
                      <td className="px-4 py-3 tabular-nums text-emerald-400">
                        {formatUsd(group.total)}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">{fridayLabel}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={busy || !group.email}
                          onClick={() => void sendInvoices([group.carrier])}
                          title={
                            group.email
                              ? `Send Invoice ${invoiceNumbers[group.carrier] ?? ""} to ${group.email}`
                              : "Add carrier email on dispatch sheet"
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-2.5 py-1.5 text-xs font-medium text-emerald-300 disabled:opacity-40"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          Send
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--color-muted)]">
              Invoices emailed to carriers — mark paid, partial, unpaid, or remove the record.
            </p>
            <button
              type="button"
              onClick={() => void loadSentInvoices()}
              disabled={sentLoading}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text)] disabled:opacity-40"
            >
              {sentLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {sentError ? <p className="text-sm text-red-300">{sentError}</p> : null}

          <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--color-surface)]/80 text-xs uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Sent</th>
                  <th className="px-4 py-3">Carrier</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {sentLoading && sentInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-[var(--color-muted)]">
                      Loading sent invoices…
                    </td>
                  </tr>
                ) : sentInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-[var(--color-muted)]">
                      No sent invoices yet. Send an invoice from the Create tab.
                    </td>
                  </tr>
                ) : (
                  sentInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[var(--color-accent-dim)]/20">
                      <td className="px-4 py-3 font-semibold tabular-nums text-[var(--color-accent)]">
                        #{inv.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">
                        {new Date(inv.sentAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                        {inv.carrierName}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-[var(--color-muted)]">
                        {inv.carrierEmail || "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-emerald-400">
                        {formatUsd(inv.amountTotal)}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatUsd(inv.amountReceived)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            "rounded-full px-2 py-0.5 text-xs capitalize",
                            statusBadge(inv.paymentStatus),
                          )}
                        >
                          {inv.paymentStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void updateSentPayment(inv, "paid")}
                            className="rounded-lg border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300"
                          >
                            Paid
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Partial $"
                            value={partialAmounts[inv.id] ?? ""}
                            onChange={(e) =>
                              setPartialAmounts((prev) => ({ ...prev, [inv.id]: e.target.value }))
                            }
                            className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => void updateSentPayment(inv, "partial")}
                            className="rounded-lg border border-amber-500/40 px-2 py-1 text-xs text-amber-300"
                          >
                            Partial
                          </button>
                          <button
                            type="button"
                            onClick={() => void updateSentPayment(inv, "unpaid")}
                            className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-300"
                          >
                            Unpaid
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteSentInvoice(inv.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)] hover:text-red-300"
                            title="Remove record"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <details className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-4">
        <summary className="cursor-pointer text-sm font-medium text-[var(--color-text)]">
          Per-load detail ({data.loads.filter(isInvoiceableLoad).length} rows)
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-[var(--color-muted)]">
              <tr>
                <th className="px-2 py-2">SR#</th>
                <th className="px-2 py-2">Load #</th>
                <th className="px-2 py-2">Carrier</th>
                <th className="px-2 py-2">Broker</th>
                <th className="px-2 py-2">RC Invoice</th>
                <th className="px-2 py-2">%</th>
                <th className="px-2 py-2">Dispatch Fee</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.loads.map((load) => (
                <tr key={`${load.sr}-${load.load_id}`}>
                  <td className="px-2 py-2">{load.sr}</td>
                  <td className="px-2 py-2">{load.load_number}</td>
                  <td className="px-2 py-2">{load.carrier}</td>
                  <td className="px-2 py-2">{load.broker}</td>
                  <td className="px-2 py-2">{formatUsd(load.rate)}</td>
                  <td className="px-2 py-2">{load.dispatch_percent || "—"}</td>
                  <td className="px-2 py-2">{formatUsd(load.dispatch_fee)}</td>
                  <td className="px-2 py-2">
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5",
                        load.status.toLowerCase() === "unpaid"
                          ? "bg-red-500/15 text-red-300"
                          : "bg-white/5 text-[var(--color-muted)]",
                      )}
                    >
                      {load.status || load.invoice_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
