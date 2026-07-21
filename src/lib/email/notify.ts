import {
  getOpsNotifyEmails,
  sendBrandedMail,
} from "@/lib/email/transport";
import { getPortalUrl } from "@/lib/supabase/env";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function send(opts: {
  to: string | string[];
  subject: string;
  title: string;
  html: string;
}) {
  await sendBrandedMail(opts);
}

export async function notifyOps(opts: {
  subject: string;
  title: string;
  html: string;
}) {
  await send({
    to: getOpsNotifyEmails(),
    subject: opts.subject,
    title: opts.title,
    html: opts.html,
  });
}

export async function notifyUser(opts: {
  email: string;
  subject: string;
  title: string;
  html: string;
}) {
  await send({
    to: opts.email,
    subject: opts.subject,
    title: opts.title,
    html: opts.html,
  });
}

export { escapeHtml };

export async function emailTicketCreated(opts: {
  clientEmail?: string | null;
  subject: string;
  description: string;
  ticketId: string;
}) {
  const portal = getPortalUrl();
  const preview = escapeHtml(opts.description.slice(0, 400));
  await notifyOps({
    subject: `New support ticket: ${opts.subject}`,
    title: "New ticket",
    html: `<p>Client opened a support ticket.</p>
      <p style="color:#6a8caf;font-size:13px;">From: ${escapeHtml(opts.clientEmail || "unknown")}</p>
      <p><strong>${escapeHtml(opts.subject)}</strong></p>
      <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #38a3ff;background:#0f1829;">${preview}</blockquote>
      <p><a href="${portal}/admin?tab=tickets" style="color:#38a3ff;">Open tickets</a></p>`,
  });
  if (opts.clientEmail) {
    await notifyUser({
      email: opts.clientEmail,
      subject: `Ticket received: ${opts.subject}`,
      title: "Ticket received",
      html: `<p>We received your support ticket and will respond soon.</p>
        <p><strong>${escapeHtml(opts.subject)}</strong></p>
        <p><a href="${portal}/dashboard?tab=tickets" style="display:inline-block;padding:10px 18px;background:#38a3ff;color:#05080f;border-radius:8px;text-decoration:none;font-weight:600;">View ticket</a></p>`,
    });
  }
}

export async function emailTicketReply(opts: {
  clientEmail: string;
  subject: string;
  preview: string;
  fromAdmin: boolean;
}) {
  const portal = getPortalUrl();
  if (opts.fromAdmin) {
    await notifyUser({
      email: opts.clientEmail,
      subject: `Reply on ticket: ${opts.subject}`,
      title: "Ticket update",
      html: `<p>The Alpha Solutions team replied to your ticket.</p>
        <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #38a3ff;background:#0f1829;">${escapeHtml(opts.preview.slice(0, 280))}</blockquote>
        <p><a href="${portal}/dashboard?tab=tickets" style="color:#38a3ff;">Open ticket</a></p>`,
    });
  } else {
    await notifyOps({
      subject: `Client reply on ticket: ${opts.subject}`,
      title: "Ticket reply",
      html: `<p>${escapeHtml(opts.clientEmail)} replied on a ticket.</p>
        <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #38a3ff;background:#0f1829;">${escapeHtml(opts.preview.slice(0, 280))}</blockquote>
        <p><a href="${portal}/admin?tab=tickets" style="color:#38a3ff;">Open tickets</a></p>`,
    });
  }
}

export async function emailProjectAssigned(opts: {
  clientEmail: string;
  title: string;
  projectId: string;
}) {
  const portal = getPortalUrl();
  await notifyUser({
    email: opts.clientEmail,
    subject: `New project: ${opts.title}`,
    title: "Project created",
    html: `<p>A new project was created for you.</p>
      <p><strong>${escapeHtml(opts.title)}</strong></p>
      <p><a href="${portal}/dashboard?tab=projects&project=${opts.projectId}" style="display:inline-block;padding:10px 18px;background:#38a3ff;color:#05080f;border-radius:8px;text-decoration:none;font-weight:600;">View project</a></p>`,
  });
  await notifyOps({
    subject: `Project created: ${opts.title}`,
    title: "Project created",
    html: `<p>Assigned to ${escapeHtml(opts.clientEmail)}</p>
      <p><strong>${escapeHtml(opts.title)}</strong></p>
      <p><a href="${portal}/admin?tab=projects" style="color:#38a3ff;">Open projects</a></p>`,
  });
}

export async function emailAiChatStarted(opts: {
  clientEmail?: string | null;
  firstMessage: string;
  conversationId: string;
}) {
  const portal = getPortalUrl();
  await notifyOps({
    subject: `New Assistant chat started${opts.clientEmail ? ` — ${opts.clientEmail}` : ""}`,
    title: "New AI chat",
    html: `<p>A client started a new Alpha Assistant conversation.</p>
      <p style="color:#6a8caf;font-size:13px;">${escapeHtml(opts.clientEmail || "unknown")}</p>
      <p><strong>First message:</strong></p>
      <blockquote style="margin:8px 0 16px;padding:12px 16px;border-left:3px solid #38a3ff;background:#0f1829;">${escapeHtml(opts.firstMessage.slice(0, 500))}</blockquote>
      <p><a href="${portal}/admin?tab=ai&c=${opts.conversationId}" style="color:#38a3ff;">Open shared chat</a></p>`,
  });
}

export async function emailAiChat(opts: {
  clientEmail?: string | null;
  userMessage: string;
  assistantReply: string;
  conversationId: string;
  isNewConversation?: boolean;
}) {
  const portal = getPortalUrl();
  await notifyOps({
    subject: `${opts.isNewConversation ? "New" : "Update"} — Assistant chat${opts.clientEmail ? ` — ${opts.clientEmail}` : ""}`,
    title: opts.isNewConversation ? "New AI chat" : "Assistant conversation",
    html: `<p>${opts.isNewConversation ? "A client started chatting with Alpha Assistant." : "Client spoke with Alpha Assistant."}</p>
      <p style="color:#6a8caf;font-size:13px;">${escapeHtml(opts.clientEmail || "unknown")}</p>
      <p><strong>Client:</strong></p>
      <blockquote style="margin:8px 0 16px;padding:12px 16px;border-left:3px solid #38a3ff;background:#0f1829;">${escapeHtml(opts.userMessage.slice(0, 400))}</blockquote>
      <p><strong>Assistant:</strong></p>
      <blockquote style="margin:8px 0 16px;padding:12px 16px;border-left:3px solid #5bc8ff;background:#0f1829;">${escapeHtml(opts.assistantReply.slice(0, 400))}</blockquote>
      <p><a href="${portal}/admin?tab=ai&c=${opts.conversationId}" style="color:#38a3ff;">Open shared chat</a></p>`,
  });
}

export async function emailHumanJoined(opts: {
  clientEmail: string;
  conversationId: string;
}) {
  const portal = getPortalUrl();
  await notifyUser({
    email: opts.clientEmail,
    subject: "A team member joined your chat",
    title: "Human support",
    html: `<p>An Alpha Solutions team member has joined your Assistant conversation.</p>
      <p><a href="${portal}/dashboard?tab=ai" style="color:#38a3ff;">Return to chat</a></p>`,
  });
}

export async function emailProjectComment(opts: {
  projectTitle: string;
  projectId: string;
  clientEmail?: string | null;
  author: string;
  body: string;
  fromAdmin: boolean;
}) {
  const portal = getPortalUrl();
  const preview = escapeHtml(opts.body.slice(0, 400));
  const link = `${portal}/dashboard?tab=projects&project=${opts.projectId}`;
  const adminLink = `${portal}/admin?tab=projects`;

  if (opts.fromAdmin && opts.clientEmail) {
    await notifyUser({
      email: opts.clientEmail,
      subject: `New comment on ${opts.projectTitle}`,
      title: "Project comment",
      html: `<p><strong>${escapeHtml(opts.author)}</strong> commented on your project.</p>
        <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #38a3ff;background:#0f1829;">${preview}</blockquote>
        <p><a href="${link}" style="color:#38a3ff;">View project</a></p>`,
    });
  }
  if (!opts.fromAdmin) {
    await notifyOps({
      subject: `Client comment on ${opts.projectTitle}`,
      title: "Project comment",
      html: `<p><strong>${escapeHtml(opts.author)}</strong> commented on a project.</p>
        <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #38a3ff;background:#0f1829;">${preview}</blockquote>
        <p><a href="${adminLink}" style="color:#38a3ff;">Open admin projects</a></p>`,
    });
  }
}

export async function emailProjectStatusChange(opts: {
  clientEmail: string;
  projectTitle: string;
  projectId: string;
  status: string;
  note: string;
}) {
  const portal = getPortalUrl();
  const statusLabels: Record<string, string> = {
    planning: "Planning",
    in_progress: "In progress",
    review: "In review",
    completed: "Completed",
    on_hold: "On hold",
  };
  await notifyUser({
    email: opts.clientEmail,
    subject: `Project update: ${opts.projectTitle}`,
    title: "Project status",
    html: `<p>Your project <strong>${escapeHtml(opts.projectTitle)}</strong> was updated.</p>
      <p>Status: <strong>${escapeHtml(statusLabels[opts.status] || opts.status)}</strong></p>
      <p>${escapeHtml(opts.note)}</p>
      <p><a href="${portal}/dashboard?tab=projects&project=${opts.projectId}" style="color:#38a3ff;">View project</a></p>`,
  });
}
