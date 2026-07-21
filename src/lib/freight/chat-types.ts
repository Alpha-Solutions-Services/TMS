export type ChatAttachment = {
  name: string;
  url: string;
  mime: string;
  docType?: "rate_con" | "bol" | "pod" | "commodity" | "other";
};

export type ChatMessage = {
  id: string;
  sender_role: string;
  body: string;
  created_at: string;
  attachments?: ChatAttachment[];
};
