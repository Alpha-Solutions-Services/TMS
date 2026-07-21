export const SITE_NAME = "Alpha Freight Network";
export const SITE_BRAND_SHORT = "Alpha Freight";
export const SITE_URL =
  process.env.NEXT_PUBLIC_TMS_URL || "https://tms.alphasolutions.software";

export const COMPANY = {
  name: "Alpha Solutions Services LLC",
  email: "info@alphasolutions.software",
  logoUrl: "/afn-logo.png",
  phone: "+1 (000) 000-0000",
};

export function absoluteUrl(path: string): string {
  const base = SITE_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
