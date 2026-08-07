"use client";

import { useState } from "react";
import clsx from "clsx";
import { FileText, Pencil, Trash2 } from "lucide-react";
import type { ChatAttachment, ChatMessage } from "@/lib/freight/chat-types";

function isOwnMessage(message: ChatMessage, viewerRole: string): boolean {
  if (message.mine === true) return true;
  if (message.mine === false) return false;
  if (viewerRole === "dispatcher") return message.sender_role === "dispatcher";
  if (viewerRole === "carrier") return message.sender_role === "carrier";
  if (viewerRole === "driver") return message.sender_role === "driver";
  return false;
}

export function ChatMessageBubble({
  message,
  viewerRole = "dispatcher",
  onEdit,
  onDelete,
}: {
  message: ChatMessage;
  viewerRole?: "dispatcher" | "carrier" | "driver";
  onEdit?: (id: string, body: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const own = isOwnMessage(message, viewerRole);
  const deleted = Boolean(message.deleted_at);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  async function saveEdit() {
    if (!onEdit || !draft.trim()) return;
    setBusy(true);
    try {
      await onEdit(message.id, draft.trim());
      setEditing(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not edit message");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!onDelete) return;
    if (!window.confirm("Delete this message?")) return;
    setBusy(true);
    try {
      await onDelete(message.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not delete message");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={clsx("flex w-full", own ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[min(85%,28rem)] px-3 py-2 shadow-sm",
          own
            ? "rounded-2xl rounded-br-md bg-[#005c4b] text-white"
            : "rounded-2xl rounded-bl-md bg-[var(--color-surface)] text-[var(--color-text)]",
        )}
      >
        {!own ? (
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
            {message.sender_role}
          </p>
        ) : null}

        {deleted ? (
          <p
            className={clsx(
              "text-sm italic",
              own ? "text-white/70" : "text-[var(--color-muted)]",
            )}
          >
            Message deleted
          </p>
        ) : editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/20 bg-black/20 px-2 py-1.5 text-sm text-inherit outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !draft.trim()}
                onClick={() => void saveEdit()}
                className="rounded-lg bg-white/90 px-2 py-1 text-[11px] font-semibold text-[#005c4b] disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDraft(message.body);
                  setEditing(false);
                }}
                className="rounded-lg px-2 py-1 text-[11px] opacity-80"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {message.body ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
            ) : null}
            {message.attachments?.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {message.attachments.map((a, i) => (
                  <a
                    key={i}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                      "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs underline-offset-2 hover:underline",
                      own
                        ? "bg-black/20 text-white"
                        : "border border-[var(--color-border)] text-[var(--color-accent)]",
                    )}
                  >
                    <FileText className="h-3 w-3" />
                    {a.name}
                  </a>
                ))}
              </div>
            ) : null}
          </>
        )}

        <div
          className={clsx(
            "mt-1 flex items-center gap-2",
            own ? "justify-end text-white/70" : "justify-between text-[var(--color-muted)]",
          )}
        >
          {own && !deleted && (onEdit || onDelete) ? (
            <div className="flex items-center gap-1">
              {onEdit ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDraft(message.body);
                    setEditing(true);
                  }}
                  className="rounded p-0.5 opacity-80 hover:opacity-100"
                  aria-label="Edit message"
                  title="Edit"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove()}
                  className="rounded p-0.5 opacity-80 hover:opacity-100"
                  aria-label="Delete message"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          ) : (
            <span />
          )}
          <p className="text-[10px]">
            {message.edited_at && !deleted ? "edited · " : ""}
            {time}
          </p>
        </div>
      </div>
    </div>
  );
}

export type DocAnalysis = {
  summary: string;
  fields: Record<string, string>;
  documentType: string;
  file: File;
  attachment: ChatAttachment;
};

export function formatDocFieldsAsMessage(fields: Record<string, string>): string {
  return [
    fields.rcInvoice ? `$${fields.rcInvoice}` : null,
    fields.miles ? `${fields.miles} mi` : null,
    fields.loadDetails || null,
    fields.pickupDateTime ? `Pickup ${fields.pickupDateTime}` : null,
    fields.truckTrailer || null,
    fields.notes || null,
  ]
    .filter(Boolean)
    .join("\n");
}
