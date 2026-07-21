import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { getOpsNotifyEmails } from "@/lib/email/transport";
import { notifyUser } from "@/lib/email/notify";

type CreateNotif = {
  userId: string;
  title: string;
  body?: string;
  href?: string;
  kind?: string;
  meta?: Record<string, unknown>;
  /** Also email the user */
  email?: string | null;
};

export async function createNotification(opts: CreateNotif) {
  const db = getServiceRoleClient();
  if (!db) return;
  await db.from("portal_notifications").insert({
    user_id: opts.userId,
    title: opts.title,
    body: opts.body ?? null,
    href: opts.href ?? null,
    kind: opts.kind ?? "info",
    meta: opts.meta ?? null,
  });
  if (opts.email) {
    void notifyUser({
      email: opts.email,
      subject: opts.title,
      title: opts.title,
      html: `<p>${(opts.body || "").replace(/</g, "&lt;")}</p>
        ${opts.href ? `<p><a href="${opts.href}" style="color:#38a3ff;">Open portal</a></p>` : ""}`,
    });
  }
}

/** Notify all ops emails that have matching auth users when possible; always email ops. */
export async function notifyOpsInApp(opts: {
  title: string;
  body?: string;
  href?: string;
  kind?: string;
}) {
  const db = getServiceRoleClient();
  const emails = getOpsNotifyEmails();
  if (!db) return;

  for (const email of emails) {
    try {
      const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
      const user = data?.users?.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );
      if (user) {
        await createNotification({
          userId: user.id,
          title: opts.title,
          body: opts.body,
          href: opts.href,
          kind: opts.kind || "ops",
        });
      }
    } catch {
      /* ignore */
    }
  }
}

export async function findUserIdByEmail(
  email: string
): Promise<string | null> {
  const db = getServiceRoleClient();
  if (!db) return null;
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  const user = data?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  return user?.id ?? null;
}
