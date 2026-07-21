/** Shared upload limits and MIME detection for RC/POD/chat attachments. */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/x-pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export function resolveUploadMime(file: File): string | null {
  const type = file.type?.trim().toLowerCase();
  if (type && type !== "application/octet-stream") {
    return ALLOWED_MIMES.has(type) ? type : null;
  }

  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  return null;
}

export function isPdfMime(mime: string): boolean {
  return mime === "application/pdf" || mime === "application/x-pdf";
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function maxUploadLabelMb(): number {
  return Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
}
