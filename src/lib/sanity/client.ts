import { createClient } from "@sanity/client";

const DEFAULT_PROJECT_ID = "lx58x5y4";

export function getSanityReadClient() {
  const projectId =
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
  const dataset =
    process.env.NEXT_PUBLIC_SANITY_DATASET?.trim() || "production";
  if (!projectId) return null;
  return createClient({
    projectId,
    dataset,
    apiVersion: "2024-01-01",
    useCdn: true,
  });
}
