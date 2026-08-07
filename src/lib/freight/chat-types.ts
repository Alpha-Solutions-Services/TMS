export type ChatAttachment = {
  name: string;
  url: string;
  mime: string;
  docType?: "rate_con" | "bol" | "pod" | "commodity" | "other";
};

export type ChatMessage = {
  id: string;
  sender_role: string;
  sender_id?: string | null;
  body: string;
  created_at: string;
  attachments?: ChatAttachment[];
  edited_at?: string | null;
  deleted_at?: string | null;
  /** True when the current viewer sent this message */
  mine?: boolean;
};

export type ChatMessageChannel = "carrier_dm" | "thread";
