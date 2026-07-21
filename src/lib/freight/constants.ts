import { COMPANY, SITE_URL } from "@/data/site";

/** Only support email for Alpha Solutions — never use freight@ */
export const FREIGHT_SUPPORT_EMAIL =
  process.env.FREIGHT_SUPPORT_EMAIL?.trim() ||
  process.env.CONTACT_EMAIL?.trim() ||
  COMPANY.email;

export const FREIGHT_TEAM_EMAIL =
  process.env.FREIGHT_TEAM_EMAIL?.trim() ||
  process.env.CONTACT_EMAIL?.trim() ||
  COMPANY.email;

/** Public site URL — used in outbound emails */
export const PUBLIC_SITE_URL = SITE_URL.replace(/\/$/, "");
