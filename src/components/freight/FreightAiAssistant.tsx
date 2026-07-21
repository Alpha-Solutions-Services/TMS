"use client";

import { useRef, useState } from "react";
import { Bot, FileUp, Loader2, Send, Sparkles } from "lucide-react";
import type { LoadFormValues } from "@/components/freight/LoadFormModal";

export function FreightAiAssistant({
  compact = false,
  embedded = false,
  allowFiles = false,
  onLoadFieldsExtracted,
}: {
  compact?: boolean;
  embedded?: boolean;
  allowFiles?: boolean;
  onLoadFieldsExtracted?: (fields: Partial<LoadFormValues>, summary: string) => void;
}) {
  const [open, setOpen] = useState(!compact);
  const [message, setMessage] = useState("");
  const [training, setTraining] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [parseMsg, setParseMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function send() {
    if (!message.trim() || busy) return;
    const userMsg = message.trim();
    setMessage("");
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setBusy(true);
    try {
      const res = await fetch("/api/freight/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          conversationId,
          trainingNotes: training.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        reply?: string;
        conversationId?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed");
      if (json.conversationId) setConversationId(json.conversationId);
      setMessages((m) => [...m, { role: "assistant", content: json.reply ?? "" }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: e instanceof Error ? e.message : "Error" },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function parseDocument(file: File) {
    setBusy(true);
    setParseMsg(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const hint = file.name.toLowerCase().includes("bol")
        ? "bol"
        : file.name.toLowerCase().includes("pod")
          ? "pod"
          : "rate_con";
      form.set("docType", hint);

      const res = await fetch("/api/freight/ai/parse-document", { method: "POST", body: form });
      const json = (await res.json()) as {
        error?: string;
        fields?: Partial<LoadFormValues>;
        carrierSummary?: string;
        documentType?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Parse failed");

      const summary = json.carrierSummary ?? "Document parsed.";
      setParseMsg(`${json.documentType?.toUpperCase() ?? "DOC"} extracted: ${summary}`);
      setMessages((m) => [
        ...m,
        { role: "user", content: `[Uploaded ${file.name}]` },
        {
          role: "assistant",
          content: `Extracted from ${json.documentType ?? "document"}:\n${summary}\n\n${JSON.stringify(json.fields, null, 2)}`,
        },
      ]);
      if (json.fields && onLoadFieldsExtracted) {
        onLoadFieldsExtracted(json.fields, summary);
      }
    } catch (e) {
      setParseMsg(e instanceof Error ? e.message : "Could not parse document");
    } finally {
      setBusy(false);
    }
  }

  if (compact && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)] text-[#05080f] shadow-lg"
        aria-label="Open Alpha AI Assistant"
      >
        <Bot className="h-5 w-5" />
      </button>
    );
  }

  const shellClass = embedded
    ? "flex flex-col"
    : compact
      ? "fixed bottom-4 right-4 z-40 flex w-[min(100%,22rem)] flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
      : "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 flex flex-col";

  return (
    <div className={shellClass}>
      {!embedded ? (
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <Bot className="h-4 w-4 text-[var(--color-accent)]" />
            Alpha AI Assistant
          </div>
          {compact ? (
            <button type="button" onClick={() => setOpen(false)} className="text-[var(--color-muted)]">
              ×
            </button>
          ) : null}
        </div>
      ) : null}
      {!embedded && !compact ? (
        <div className="border-b border-[var(--color-border)] px-4 py-2">
          <label className="text-[10px] text-[var(--color-muted)]">Train assistant (super notes)</label>
          <input
            value={training}
            onChange={(e) => setTraining(e.target.value)}
            placeholder="e.g. Always mention 8% dispatch fee…"
            className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs"
          />
        </div>
      ) : null}
      <div
        className={`overflow-y-auto px-3 py-2 ${embedded ? "max-h-48 min-h-[8rem]" : compact ? "max-h-64 min-h-[12rem]" : "min-h-[8rem] max-h-64"}`}
      >
        {messages.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">
            Ask about loads, carriers, invoices. {allowFiles ? "Upload RC, BOL, or POD to auto-extract load fields." : ""}
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`mb-2 rounded-lg px-2 py-1.5 text-xs ${
                m.role === "user"
                  ? "ml-4 bg-[var(--color-accent-dim)] text-[var(--color-text)]"
                  : "mr-4 bg-[var(--color-bg)] text-[var(--color-muted)] whitespace-pre-wrap"
              }`}
            >
              {m.content}
            </div>
          ))
        )}
      </div>
      {parseMsg ? <p className="px-3 pb-1 text-[10px] text-emerald-400">{parseMsg}</p> : null}
      <div className="flex gap-2 border-t border-[var(--color-border)] p-3">
        {allowFiles ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void parseDocument(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-muted)] hover:text-[var(--color-accent)]"
              title="Upload RC, BOL, POD — AI extracts load data"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            </button>
          </>
        ) : null}
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          placeholder="Ask Alpha AI…"
          className="dispatch-field flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void send()}
          className="rounded-lg bg-[var(--color-accent)] p-2 text-[#05080f] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      {allowFiles ? (
        <p className="flex items-center gap-1 px-3 pb-2 text-[10px] text-[var(--color-muted)]">
          <Sparkles className="h-3 w-3" />
          Vector-style doc AI: RC/BOL/POD → load fields for booking
        </p>
      ) : null}
    </div>
  );
}
