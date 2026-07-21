-- Storage buckets for chat RC uploads and load documents
-- Applied via MCP; keep for local/docs reference

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('freight-chat-attachments', 'freight-chat-attachments', false, 26214400,
   ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/gif','application/octet-stream']),
  ('freight-load-documents', 'freight-load-documents', false, 26214400,
   ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/gif','application/octet-stream'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
