"use client";

import clsx from "clsx";
import { FileText } from "lucide-react";
import type { ChatAttachment, ChatMessage } from "@/lib/freight/chat-types";

function isOwnMessage(senderRole: string, viewerRole: string): boolean {
  if (viewerRole === "dispatcher") return senderRole === "dispatcher";
  if (viewerRole === "carrier") return senderRole === "carrier";
  if (viewerRole === "driver") return senderRole === "driver";
  return false;
}

export function ChatMessageBubble({
  message,
  viewerRole = "dispatcher",
}: {
  message: ChatMessage;
  viewerRole?: "dispatcher" | "carrier" | "driver";
}) {
  const own = isOwnMessage(message.sender_role, viewerRole);
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

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
                  own ? "bg-black/20 text-white" : "border border-[var(--color-border)] text-[var(--color-accent)]",
                )}
              >
                <FileText className="h-3 w-3" />
                {a.name}
              </a>
            ))}
          </div>
        ) : null}
        <p
          className={clsx(
            "mt-1 text-right text-[10px]",
            own ? "text-white/70" : "text-[var(--color-muted)]",
          )}
        >
          {time}
        </p>
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
