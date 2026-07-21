import {
  brandedEmailWrap,
  createConfiguredTransporter,
  createInvoiceTransporter,
  resolveInvoiceFromAddress,
  resolveSmtpFromAddress,
} from "@/lib/freight/email-transport";
import { FREIGHT_SUPPORT_EMAIL, FREIGHT_TEAM_EMAIL, PUBLIC_SITE_URL } from "./constants";
import type { CarrierDispatchInvoice, InvoiceIssuer } from "./dispatch-invoice";
import { formatInvoiceDate } from "./dispatch-invoice";
import {
  paymentDetailsToEmailHtml,
  paymentDetailsToEmailText,
  type InvoicePaymentDetails,
} from "./dispatch-invoice-payment";

const cta = (label: string, href: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;padding:14px 24px;background:#38a3ff;color:#05080f;border-radius:10px;font-weight:700;text-decoration:none">${label}</a></p>`;

async function sendTransactional(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  from?: string;
  attachments?: { filename: string; content: Buffer }[];
}) {
  const transporter = createConfiguredTransporter();
  const smtpUser = process.env.SMTP_USER?.trim();
  if (!transporter || !smtpUser) {
    console.warn("[freight-mail] SMTP missing — outbound mail skipped:", params.subject);
    return { ok: false as const, error: "SMTP not configured" };
  }
  await transporter.sendMail({
    from: resolveSmtpFromAddress(params.from ?? `Alpha Solutions <${smtpUser}>`),
    to: params.to,
    replyTo: params.replyTo,
    subject: params.subject,
    text: params.text,
    html: params.html,
    attachments: params.attachments,
  });
  return { ok: true as const };
}

export async function sendDriverInvitationEmail(
  to: string,
  driverName: string,
  inviterName: string,
  carrierName: string,
  inviteUrl: string
) {
  const html = brandedEmailWrap(
    "Invitation",
    `<p>Hi ${escapeHtml(driverName || "there")},</p>
     <p><strong>${escapeHtml(carrierName)}</strong>, supported by ${escapeHtml(inviterName)}, has invited you to join Alpha Freight as a driver.</p>
     <p>Accept your invitation to set up your account:</p>
     ${cta("Accept invitation", inviteUrl)}
     <p style="color:#6a8caf;font-size:13px;">This invitation expires in 7 days. If you did not expect this, you can ignore this email.</p>`,
  );

  await sendTransactional({
    to,
    subject: "You've been invited to join Alpha Freight",
    html,
    text: `You've been invited to Alpha Freight.\nAccept: ${inviteUrl}`,
  });
}

export async function sendCarrierApprovedEmail(to: string, carrierName: string) {
  const loginUrl = `${PUBLIC_SITE_URL}/login`;
  const html = brandedEmailWrap(
    "Account approved",
    `<p>Hi ${escapeHtml(carrierName)},</p>
     <p>Your Alpha Freight carrier account has been approved. Sign in anytime to manage loads and your fleet.</p>
     ${cta("Login to Alpha Freight", loginUrl)}
     <p style="font-size:13px;color:#6a8caf;">Questions? ${FREIGHT_SUPPORT_EMAIL}</p>`,
  );
  await sendTransactional({
    to,
    subject: "Your Alpha Freight carrier account has been approved",
    html,
    text: `Your carrier account ${carrierName} is approved.\nLogin: ${loginUrl}`,
  });
}

export async function sendCarrierRejectedEmail(
  to: string,
  carrierName: string,
  reason: string,
) {
  const html = brandedEmailWrap(
    "Registration update",
    `<p>Hi ${escapeHtml(carrierName)},</p>
     <p>We're unable to approve your Alpha Freight carrier application at this time.</p>
     <p style="margin-top:14px;"><strong>Reason:</strong></p>
     <blockquote style="border-left:3px solid #38a3ff;padding-left:12px;color:#edf2f8;">
       ${escapeHtml(reason)}
     </blockquote>
     <p style="font-size:13px;color:#6a8caf;">If this looks incorrect, reply to this email or contact ${FREIGHT_SUPPORT_EMAIL}.</p>`,
  );
  await sendTransactional({
    to,
    subject: "Alpha Freight carrier application update",
    html,
    text: `Carrier application not approved (${carrierName}). Reason: ${reason}`,
  });
}

export async function sendCarrierPendingEmail(
  to: string,
  carrierName: string,
  mcNumber: string,
) {
  const html = brandedEmailWrap(
    "New carrier pending",
    `<p>New carrier awaiting approval.</p>
     <ul style="margin:14px 0;padding-left:20px;line-height:1.7;">
       <li><strong>Company:</strong> ${escapeHtml(carrierName)}</li>
       <li><strong>MC:</strong> ${escapeHtml(mcNumber)}</li>
       <li><strong>Reviewer queue:</strong> Dispatcher dashboard · Carriers · Pending Approval</li>
     </ul>
     ${cta("Review in dashboard", `${PUBLIC_SITE_URL}/dispatcher/carriers`)}`,
  );
  await sendTransactional({
    to: FREIGHT_TEAM_EMAIL,
    subject: `Alpha Freight • New carrier pending: ${carrierName}`,
    html,
    text: `New carrier pending: ${carrierName}, MC ${mcNumber}`,
    replyTo: to,
  });
}

export async function sendStudentWelcomeEmail(
  to: string,
  studentName: string,
  planLabel: string,
) {
  const dash = `${PUBLIC_SITE_URL}/freight/student/dashboard`;
  const html = brandedEmailWrap(
    "Welcome",
    `<p>Hi ${escapeHtml(studentName)},</p>
     <p>Your Alpha Freight Academy enrollment (${escapeHtml(planLabel)}) is active. Dive into your lessons whenever you're ready.</p>
     ${cta("Go to dashboard", dash)}`,
  );
  await sendTransactional({
    to,
    subject: "You're enrolled — Alpha Freight Academy",
    html,
    text: `Welcome to Alpha Freight Academy (${planLabel}). Dashboard: ${dash}`,
  });
}

export async function sendStudentPaymentFailedEmail(to: string, studentName: string) {
  const enrollUrl = `${PUBLIC_SITE_URL}/freight/student/enroll`;
  const html = brandedEmailWrap(
    "Payment issue",
    `<p>Hi ${escapeHtml(studentName)},</p>
     <p>We couldn't process your recent Alpha Freight Academy payment.</p>
     <p style="margin-top:14px;">Update billing to keep uninterrupted access:</p>
     ${cta("Update enrollment", enrollUrl)}
     ${supportSnippet()}`,
  );
  await sendTransactional({
    to,
    subject: "Action needed — Alpha Freight payment failed",
    html,
    text: `Payment failed for Alpha Freight Academy.\nRenew: ${enrollUrl}`,
  });
}

export async function sendStudentSubscriptionCancelledEmail(
  to: string,
  studentName: string,
) {
  const enrollUrl = `${PUBLIC_SITE_URL}/freight/student/enroll`;
  const html = brandedEmailWrap(
    "Enrollment ended",
    `<p>Hi ${escapeHtml(studentName)},</p>
     <p>Your Alpha Freight Academy subscription ended. Course access pauses until you re-enroll.</p>
     ${cta("Review plans", enrollUrl)}
     ${supportSnippet()}`,
  );
  await sendTransactional({
    to,
    subject: "Alpha Freight Academy subscription ended",
    html,
    text: `Subscription ended. Re-enroll: ${enrollUrl}`,
  });
}

function supportSnippet() {
  return `<p style="font-size:13px;color:#6a8caf;margin-top:20px;">Help: ${FREIGHT_SUPPORT_EMAIL}</p>`;
}

function formatMoneyUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export async function sendCarrierDispatchInvoiceEmail(params: {
  invoice: CarrierDispatchInvoice;
  issuer: InvoiceIssuer;
  payment: InvoicePaymentDetails;
  pdf: Buffer;
  pdfFilename: string;
}) {
  const { invoice, issuer, payment, pdf, pdfFilename } = params;
  const to = invoice.billTo.email?.trim();
  if (!to || to === "—") {
    return { ok: false as const, error: "Carrier email missing on dispatch sheet" };
  }

  const greetingName =
    invoice.billTo.contactName?.trim() ||
    invoice.billTo.companyName.split(/\s+/)[0] ||
    "there";

  const loadLines = invoice.lineItems.map((li) => li.emailSummary).join("\n");
  const loadLinesHtml = invoice.lineItems
    .map((li) => `<li>${escapeHtml(li.emailSummary)}</li>`)
    .join("");

  const paymentBlock = paymentDetailsToEmailText(payment);
  const paymentHtml = paymentDetailsToEmailHtml(payment);

  const subject = `Invoice # ${invoice.invoiceNumber} Payment Details - ${invoice.carrierName} to ${issuer.brandName}`;

  const text = `Hi ${greetingName},

Please find the payment details for Invoice #${invoice.invoiceNumber} – ${invoice.carrierName}.

Amount Due: ${formatMoneyUsd(invoice.total)}

This invoice covers the following loads:

${loadLines}

${paymentBlock}

Kindly submit the payment and send a screenshot of the confirmation for our records.

Best regards,

${issuer.contactName}
${issuer.brandName}
Department of ${issuer.companyName}`;

  const html = brandedEmailWrap(
    "Invoice payment",
    `<p>Hi ${escapeHtml(greetingName)},</p>
     <p>Please find the payment details for <strong>Invoice #${invoice.invoiceNumber} – ${escapeHtml(invoice.carrierName)}</strong>.</p>
     <p style="margin-top:18px;font-size:18px;"><strong>Amount Due:</strong> ${escapeHtml(formatMoneyUsd(invoice.total))}</p>
     <p style="margin-top:18px;margin-bottom:8px;">This invoice covers the following loads:</p>
     <ul style="margin:0 0 18px;padding-left:20px;line-height:1.7;">${loadLinesHtml}</ul>
     ${paymentHtml}
     <p style="margin-top:20px;">Kindly submit the payment and send a screenshot of the confirmation for our records.</p>
     <p style="margin-top:24px;">Best regards,<br><strong>${escapeHtml(issuer.contactName)}</strong><br>${escapeHtml(issuer.brandName)}<br>Department of ${escapeHtml(issuer.companyName)}</p>
     <p style="margin-top:18px;font-size:13px;color:#6a8caf;">Due date: ${escapeHtml(formatInvoiceDate(invoice.dueDate))} · PDF invoice attached</p>`,
  );

  const transporter = createInvoiceTransporter();
  const smtpUser =
    process.env.DISPATCH_INVOICE_SMTP_USER?.trim() || process.env.SMTP_USER?.trim();
  if (!transporter || !smtpUser) {
    console.warn("[freight-mail] Invoice SMTP missing — outbound mail skipped:", subject);
    return { ok: false as const, error: "Invoice SMTP not configured" };
  }

  await transporter.sendMail({
    from: resolveInvoiceFromAddress(issuer.emailFrom),
    to,
    subject,
    text,
    html,
    attachments: [{ filename: pdfFilename, content: pdf }],
  });

  return { ok: true as const };
}

export async function sendLoadAddedEmail(params: {
  to: string;
  carrierName: string;
  loadNumber: string;
  broker: string;
  pickup: string;
}) {
  const html = brandedEmailWrap(
    "New load assigned",
    `<p>Hi ${escapeHtml(params.carrierName)},</p>
     <p>A new load has been added to your account:</p>
     <ul>
       <li><strong>Load #:</strong> ${escapeHtml(params.loadNumber)}</li>
       <li><strong>Broker:</strong> ${escapeHtml(params.broker || "—")}</li>
       <li><strong>Pickup:</strong> ${escapeHtml(params.pickup || "—")}</li>
     </ul>
     ${cta("View in Carrier Portal", `${PUBLIC_SITE_URL}/carrier/loads`)}`,
  );
  await sendTransactional({
    to: params.to,
    subject: `New load added — ${params.loadNumber}`,
    html,
    text: `New load ${params.loadNumber} added for ${params.carrierName}.`,
  });
}

export async function sendLoadRemovedEmail(params: {
  to: string;
  carrierName: string;
  loadNumber: string;
}) {
  const html = brandedEmailWrap(
    "Load removed",
    `<p>Hi ${escapeHtml(params.carrierName)},</p>
     <p>Load <strong>#${escapeHtml(params.loadNumber)}</strong> has been removed from your active board by dispatch.</p>
     <p style="font-size:13px;color:#6a8caf;">Questions? ${FREIGHT_SUPPORT_EMAIL}</p>`,
  );
  await sendTransactional({
    to: params.to,
    subject: `Load removed — ${params.loadNumber}`,
    html,
    text: `Load ${params.loadNumber} was removed for ${params.carrierName}.`,
  });
}

export async function sendLoadUpdatedEmail(params: {
  to: string;
  carrierName: string;
  loadNumber: string;
  broker: string;
  pickup: string;
}) {
  const html = brandedEmailWrap(
    "Load updated",
    `<p>Hi ${escapeHtml(params.carrierName)},</p>
     <p>Load <strong>#${escapeHtml(params.loadNumber)}</strong> was updated by dispatch:</p>
     <ul>
       <li><strong>Broker:</strong> ${escapeHtml(params.broker || "—")}</li>
       <li><strong>Pickup:</strong> ${escapeHtml(params.pickup || "—")}</li>
     </ul>
     ${cta("View in Carrier Portal", `${PUBLIC_SITE_URL}/carrier/loads`)}`,
  );
  await sendTransactional({
    to: params.to,
    subject: `Load updated — ${params.loadNumber}`,
    html,
    text: `Load ${params.loadNumber} updated for ${params.carrierName}.`,
  });
}

export async function sendDriverAddedToCarrierEmail(params: {
  to: string;
  carrierName: string;
  driverName: string;
  driverEmail: string;
}) {
  const html = brandedEmailWrap(
    "Driver added",
    `<p>Hi ${escapeHtml(params.carrierName)},</p>
     <p>Driver <strong>${escapeHtml(params.driverName)}</strong> (${escapeHtml(params.driverEmail)}) has been added to your fleet.</p>
     ${cta("Manage drivers", `${PUBLIC_SITE_URL}/carrier/drivers`)}`,
  );
  await sendTransactional({
    to: params.to,
    subject: `Driver added — ${params.driverName}`,
    html,
    text: `Driver ${params.driverName} added to ${params.carrierName}.`,
  });
}

export async function sendFridayInvoiceReminderEmail(params: {
  to: string;
  dispatcherName: string;
  invoiceCount: number;
  dueDateLabel: string;
}) {
  const html = brandedEmailWrap(
    "Friday invoice reminder",
    `<p>Hi ${escapeHtml(params.dispatcherName)},</p>
     <p><strong>Today is Friday</strong> — carrier dispatch invoices should be sent today only.</p>
     <p>You have <strong>${params.invoiceCount}</strong> carrier invoice(s) ready · due ${escapeHtml(params.dueDateLabel)}.</p>
     ${cta("Send invoices now", `${PUBLIC_SITE_URL}/dispatcher/invoices?action=generate`)}
     <p style="font-size:13px;color:#6a8caf;">Invoices are issued on Fridays only. Paid loads are excluded automatically.</p>`,
  );
  await sendTransactional({
    to: params.to,
    subject: "Reminder: Send carrier invoices today (Friday)",
    html,
    text: `Friday invoice reminder: ${params.invoiceCount} invoices ready, due ${params.dueDateLabel}.`,
  });
}

export async function sendLoadActionDispatcherEmail(params: {
  to: string;
  action: "added" | "removed" | "updated";
  loadNumber: string;
  carrierName: string;
  actorEmail: string;
}) {
  const verb = params.action === "added" ? "added" : params.action === "removed" ? "removed" : "updated";
  const html = brandedEmailWrap(
    `Load ${verb}`,
    `<p>Dispatch log: load <strong>#${escapeHtml(params.loadNumber)}</strong> for <strong>${escapeHtml(params.carrierName)}</strong> was ${verb} by ${escapeHtml(params.actorEmail)}.</p>`,
  );
  await sendTransactional({
    to: params.to,
    subject: `Load ${verb}: ${params.loadNumber} — ${params.carrierName}`,
    html,
    text: `Load ${params.loadNumber} ${verb} for ${params.carrierName}.`,
  });
}

export async function sendDispatcherMessageToCarrierEmail(params: {
  to: string;
  carrierName: string;
  dispatcherName: string;
  message: string;
  portalUrl: string;
}) {
  const html = brandedEmailWrap(
    "Message from dispatch",
    `<p>Hi ${escapeHtml(params.carrierName)},</p>
     <p><strong>${escapeHtml(params.dispatcherName)}</strong> sent you a message:</p>
     <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #38a3ff;background:#0b111f;border-radius:8px;color:#e8f0ff;">
       ${escapeHtml(params.message).replace(/\n/g, "<br>")}
     </blockquote>
     ${cta("Open carrier portal chat", params.portalUrl)}`,
  );
  await sendTransactional({
    to: params.to,
    subject: `Message from Alpha Dispatch — ${params.dispatcherName}`,
    html,
    text: `${params.dispatcherName}: ${params.message}\n\nView: ${params.portalUrl}`,
  });
}

export async function sendPortalConfigUpdatedEmail(params: {
  to: string;
  carrierName: string;
  dispatcherName: string;
}) {
  const html = brandedEmailWrap(
    "Portal updated",
    `<p>Hi ${escapeHtml(params.carrierName)},</p>
     <p>Your carrier portal display was updated by dispatch (${escapeHtml(params.dispatcherName)}).</p>
     ${cta("View carrier portal", `${PUBLIC_SITE_URL}/carrier/dashboard`)}`,
  );
  await sendTransactional({
    to: params.to,
    subject: "Your carrier portal was updated",
    html,
    text: `Portal updated for ${params.carrierName}. View: ${PUBLIC_SITE_URL}/carrier/dashboard`,
  });
}

export async function sendLoadAssignedToDriverEmail(params: {
  to: string;
  driverName: string;
  loadNumber: string;
  pickup: string;
  delivery: string;
}) {
  const html = brandedEmailWrap(
    "Load assigned",
    `<p>Hi ${escapeHtml(params.driverName)},</p>
     <p>You have been assigned load <strong>#${escapeHtml(params.loadNumber)}</strong>.</p>
     <ul>
       <li><strong>Pickup:</strong> ${escapeHtml(params.pickup || "—")}</li>
       <li><strong>Delivery:</strong> ${escapeHtml(params.delivery || "—")}</li>
     </ul>
     ${cta("Open driver portal", `${PUBLIC_SITE_URL}/driver/dashboard`)}`,
  );
  await sendTransactional({
    to: params.to,
    subject: `Load assigned — ${params.loadNumber}`,
    html,
    text: `Load ${params.loadNumber} assigned. Pickup: ${params.pickup}. Driver portal: ${PUBLIC_SITE_URL}/driver/dashboard`,
  });
}

export async function sendLoadDriverAssignedCarrierEmail(params: {
  to: string;
  carrierName: string;
  loadNumber: string;
  driverName: string;
}) {
  const html = brandedEmailWrap(
    "Driver assigned to load",
    `<p>Hi ${escapeHtml(params.carrierName)},</p>
     <p>Driver <strong>${escapeHtml(params.driverName)}</strong> was assigned to load <strong>#${escapeHtml(params.loadNumber)}</strong>.</p>
     ${cta("View loads", `${PUBLIC_SITE_URL}/carrier/loads`)}`,
  );
  await sendTransactional({
    to: params.to,
    subject: `Driver assigned — load ${params.loadNumber}`,
    html,
    text: `Driver ${params.driverName} assigned to load ${params.loadNumber}.`,
  });
}

export async function sendLoadDocumentUploadedEmail(params: {
  to: string;
  recipientName: string;
  loadNumber: string;
  documentLabel: string;
  uploadedBy: string;
  portalLabel: string;
  portalUrl: string;
}) {
  const html = brandedEmailWrap(
    "Document uploaded",
    `<p>Hi ${escapeHtml(params.recipientName)},</p>
     <p><strong>${escapeHtml(params.uploadedBy)}</strong> uploaded <strong>${escapeHtml(params.documentLabel)}</strong> for load <strong>#${escapeHtml(params.loadNumber)}</strong>.</p>
     ${cta(params.portalLabel, params.portalUrl)}`,
  );
  await sendTransactional({
    to: params.to,
    subject: `${params.documentLabel} uploaded — load ${params.loadNumber}`,
    html,
    text: `${params.documentLabel} uploaded for load ${params.loadNumber} by ${params.uploadedBy}. ${params.portalUrl}`,
  });
}

export async function sendTeamInviteEmail(params: {
  to: string;
  inviteeName: string;
  roleLabel: string;
  inviterName: string;
  loginUrl: string;
}) {
  const html = brandedEmailWrap(
    "Team invitation",
    `<p>Hi ${escapeHtml(params.inviteeName || "there")},</p>
     <p><strong>${escapeHtml(params.inviterName)}</strong> added you to Alpha Freight TMS as <strong>${escapeHtml(params.roleLabel)}</strong>.</p>
     <p><strong>Role rights:</strong></p>
     <ul style="color:#edf2f8;line-height:1.6;">
       <li><strong>Super Dispatcher</strong> — team, approvals, carriers, drivers, invoices</li>
       <li><strong>Dispatcher</strong> — carriers, drivers, loads (no team management)</li>
       <li><strong>Sub Dispatcher</strong> — book loads (super approval required)</li>
     </ul>
     ${cta("Sign in to TMS", params.loginUrl)}
     <p style="font-size:13px;color:#6a8caf;">Questions? ${FREIGHT_SUPPORT_EMAIL}</p>`,
  );
  return sendTransactional({
    to: params.to,
    subject: `You've been added as ${params.roleLabel} — Alpha Freight TMS`,
    html,
    text: `You were added as ${params.roleLabel} on Alpha Freight TMS. Sign in: ${params.loginUrl}`,
  });
}

export async function sendTeamAssignmentEmail(params: {
  to: string;
  dispatcherName: string;
  roleLabel: string;
  assigneeType: "carrier" | "driver";
  assigneeName: string;
  loginUrl: string;
}) {
  const kind = params.assigneeType === "carrier" ? "carrier" : "driver";
  const html = brandedEmailWrap(
    "New assignment",
    `<p>Hi ${escapeHtml(params.dispatcherName || "there")},</p>
     <p>You have been assigned as <strong>${escapeHtml(params.roleLabel)}</strong> for ${kind}:</p>
     <p style="font-size:18px;font-weight:700;color:#38a3ff;">${escapeHtml(params.assigneeName)}</p>
     <p>Sign in to manage loads, chat, and documents for this account. Contact details are visible to super dispatchers only.</p>
     ${cta("Open TMS", params.loginUrl)}
     <p style="font-size:13px;color:#6a8caf;">Questions? ${FREIGHT_SUPPORT_EMAIL}</p>`,
  );
  return sendTransactional({
    to: params.to,
    subject: `Assigned to ${kind}: ${params.assigneeName} — Alpha Freight TMS`,
    html,
    text: `You were assigned to ${kind} ${params.assigneeName}. Sign in: ${params.loginUrl}`,
  });
}

export async function sendTeamTerminatedEmail(params: { to: string; name: string }) {
  const html = brandedEmailWrap(
    "Access update",
    `<p>Hi ${escapeHtml(params.name || "there")},</p>
     <p>Your Alpha Freight TMS dispatcher access has been terminated by a super dispatcher.</p>
     <p style="font-size:13px;color:#6a8caf;">If this is unexpected, contact ${FREIGHT_SUPPORT_EMAIL}</p>`,
  );
  return sendTransactional({
    to: params.to,
    subject: "Alpha Freight TMS — dispatcher access terminated",
    html,
    text: "Your Alpha Freight TMS dispatcher access has been terminated.",
  });
}

export async function sendInvoicePaymentReceivedEmail(params: {
  to: string;
  carrierName: string;
  invoiceNumber: string;
  amountReceived: number;
  amountTotal: number;
  paymentStatus: "partial" | "paid";
}) {
  const statusLabel = params.paymentStatus === "paid" ? "Paid in full" : "Partial payment received";
  const html = brandedEmailWrap(
    "Payment received",
    `<p>Payment update for <strong>${escapeHtml(params.carrierName)}</strong></p>
     <p style="margin-top:12px;"><strong>Invoice #${escapeHtml(params.invoiceNumber)}</strong></p>
     <p style="font-size:18px;margin-top:8px;"><strong>${escapeHtml(statusLabel)}</strong></p>
     <p>Received: <strong>${escapeHtml(formatMoneyUsd(params.amountReceived))}</strong> of ${escapeHtml(formatMoneyUsd(params.amountTotal))}</p>
     ${cta("View invoices", `${PUBLIC_SITE_URL}/dispatcher/invoices`)}
     <p style="font-size:13px;color:#6a8caf;">Recorded in TMS · all invoice statuses are saved.</p>`,
  );
  await sendTransactional({
    to: params.to,
    subject: `${statusLabel} — Invoice #${params.invoiceNumber} (${params.carrierName})`,
    html,
    text: `${statusLabel} for invoice #${params.invoiceNumber}: ${formatMoneyUsd(params.amountReceived)} of ${formatMoneyUsd(params.amountTotal)}.`,
  });
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
