const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Workbook tab name → Google Sheet gid (from tab URL ?gid=). */
export const DISPATCH_MONTH_TAB_GIDS: Record<string, string> = {
  "May 2026": "1987930235",
  "June 2026": "0",
  "July 2026": "400988811",
  "August 2026": "177376133",
  "September 2026": "362718118",
  "October 2026": "2060473564",
  "November 2026": "957096208",
  "December 2026": "1309560920",
};

/** Tab name format used in the workbook, e.g. "June 2026". */
export function formatMonthTab(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Parse RC Date strings used on the load board (prefer mm/dd/yyyy).
 * Uses local calendar parts so month assignment is not shifted by UTC.
 */
export function parseRcDate(value: string): Date | null {
  const raw = value?.trim();
  if (!raw || raw === "—" || raw === "-") return null;

  const us = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (us) {
    const month = Number.parseInt(us[1], 10) - 1;
    const day = Number.parseInt(us[2], 10);
    let year = Number.parseInt(us[3], 10);
    if (year < 100) year += 2000;
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    const d = new Date(year, month, day);
    if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
      return null;
    }
    return d;
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const year = Number.parseInt(iso[1], 10);
    const month = Number.parseInt(iso[2], 10) - 1;
    const day = Number.parseInt(iso[3], 10);
    const d = new Date(year, month, day);
    if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
      return null;
    }
    return d;
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/** Month tab driven by RC Date, e.g. "7/9/2026" → "July 2026". */
export function monthTabFromRcDate(rcDate: string): string | null {
  const d = parseRcDate(rcDate);
  if (!d) return null;
  return formatMonthTab(d);
}

export function parseMonthTab(tab: string): Date | null {
  const match = tab.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const monthIndex = MONTHS.findIndex(
    (m) => m.toLowerCase() === match[1].toLowerCase(),
  );
  if (monthIndex < 0) return null;
  return new Date(Number(match[2]), monthIndex, 1);
}

export function resolveGidForMonthTab(tab: string): string | null {
  const trimmed = tab.trim();
  if (!trimmed) return null;

  const mapped = DISPATCH_MONTH_TAB_GIDS[trimmed];
  if (mapped) return mapped;

  const envJson = process.env.GOOGLE_DISPATCH_SHEET_MONTH_GIDS?.trim();
  if (envJson) {
    try {
      const extra = JSON.parse(envJson) as Record<string, string>;
      if (extra[trimmed]) return String(extra[trimmed]);
    } catch {
      /* ignore malformed env */
    }
  }

  return null;
}

/** Months configured in the workbook — shown in the month picker (click to switch). */
export function listConfiguredMonthTabs(): string[] {
  const tabs = new Set(Object.keys(DISPATCH_MONTH_TAB_GIDS));

  const envJson = process.env.GOOGLE_DISPATCH_SHEET_MONTH_GIDS?.trim();
  if (envJson) {
    try {
      const extra = JSON.parse(envJson) as Record<string, string>;
      for (const key of Object.keys(extra)) tabs.add(key);
    } catch {
      /* ignore */
    }
  }

  return Array.from(tabs).sort((a, b) => {
    const da = parseMonthTab(a);
    const db = parseMonthTab(b);
    if (da && db) return da.getTime() - db.getTime();
    return a.localeCompare(b);
  });
}

/** Recent + upcoming monthly tabs for the month picker. */
export function listMonthTabOptions(anchor = new Date(), past = 12, future = 3): string[] {
  const configured = listConfiguredMonthTabs();
  if (configured.length) return configured;

  const tabs: string[] = [];
  for (let i = past; i >= 1; i--) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    tabs.push(formatMonthTab(d));
  }
  tabs.push(formatMonthTab(anchor));
  for (let i = 1; i <= future; i++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1);
    tabs.push(formatMonthTab(d));
  }
  return tabs;
}

export function resolveActiveMonthTab(requested?: string | null): string {
  const explicit =
    requested?.trim() ||
    process.env.GOOGLE_DISPATCH_SHEET_TAB?.trim() ||
    "";
  if (explicit) return explicit;

  const useMonth =
    process.env.GOOGLE_DISPATCH_SHEET_USE_MONTH_TAB?.trim().toLowerCase() !==
    "false";
  if (useMonth) {
    const current = formatMonthTab(new Date());
    const configured = listConfiguredMonthTabs();
    if (configured.includes(current)) return current;
    if (configured.length) return configured[configured.length - 1];
    return current;
  }

  return "";
}
