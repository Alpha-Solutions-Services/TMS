import {
  buildCarrierInvoices,
  type CarrierDispatchInvoice,
} from "./dispatch-invoice";
import type { CarrierRosterEntry } from "./carrier-sheet";
import type { DashboardLoad } from "./dispatch-dashboard-types";
import { getNextInvoiceNumber } from "./dispatch-sent-invoices-db";

export async function buildDispatchInvoicesForBatch(params: {
  loads: DashboardLoad[];
  carriers?: string[];
  invoiceDate?: Date;
  invoiceNumbersByCarrier?: Record<string, string>;
  carrierRoster?: CarrierRosterEntry[];
}): Promise<CarrierDispatchInvoice[]> {
  const startNumber = await getNextInvoiceNumber();
  return buildCarrierInvoices(params.loads, {
    carriers: params.carriers,
    invoiceDate: params.invoiceDate,
    startNumber,
    invoiceNumbersByCarrier: params.invoiceNumbersByCarrier,
    carrierRoster: params.carrierRoster,
  });
}

export function assignDefaultInvoiceNumbers(
  carriers: string[],
  startNumber: number,
): Record<string, string> {
  const map: Record<string, string> = {};
  let n = startNumber;
  for (const carrier of carriers) {
    map[carrier] = String(n);
    n += 1;
  }
  return map;
}
