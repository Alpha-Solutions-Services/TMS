import webpush from "web-push";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

function configureVapid(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:support@alphasolutions.software";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  return true;
}

/** Send push to a driver's saved PWA subscriptions (wakes phone when installed). */
export async function pushDriverLiveLocationRequest(driverProfileId: string): Promise<{
  sent: number;
  skipped: boolean;
}> {
  if (!configureVapid()) {
    return { sent: 0, skipped: true };
  }

  const admin = getServiceRoleClient();
  if (!admin) return { sent: 0, skipped: true };

  const { data: rows } = await admin
    .from("tms_driver_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("driver_profile_id", driverProfileId);

  if (!rows?.length) return { sent: 0, skipped: false };

  const payload = JSON.stringify({
    title: "Live location requested",
    body: "Dispatch needs your GPS — tap to open and share automatically.",
    url: "/driver/dashboard?live=1",
    tag: "live-location",
  });

  let sent = 0;
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint as string,
          keys: {
            p256dh: row.p256dh as string,
            auth: row.auth as string,
          },
        },
        payload,
      );
      sent += 1;
    } catch (e: unknown) {
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await admin
          .from("tms_driver_push_subscriptions")
          .delete()
          .eq("id", row.id);
      } else {
        console.warn("[driver-push] send failed", e);
      }
    }
  }

  return { sent, skipped: false };
}
