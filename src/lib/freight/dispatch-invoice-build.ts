import type { CarrierDispatchInvoice, InvoiceIssuer } from "./dispatch-invoice";
import { renderCarrierInvoicePdf } from "./dispatch-invoice-pdf";
import {
  parseInvoicePaymentMethod,
  resolveInvoicePaymentDetails,
  type InvoicePaymentMethod,
} from "./dispatch-invoice-payment";

export async function buildInvoicePdfWithPayment(
  invoice: CarrierDispatchInvoice,
  issuer: InvoiceIssuer,
  paymentMethodInput: unknown,
): Promise<{
  pdf: Buffer;
  paymentMethod: InvoicePaymentMethod;
  payment: ReturnType<typeof resolveInvoicePaymentDetails>;
}> {
  const paymentMethod = parseInvoicePaymentMethod(paymentMethodInput);
  const payment = resolveInvoicePaymentDetails(issuer, paymentMethod);
  const pdf = await renderCarrierInvoicePdf(invoice, issuer, payment);

  return { pdf, paymentMethod, payment };
}
