import { getServiceRoleClient } from "@/lib/supabase/service-role";

export type FreightAction =
  | "team.invite"
  | "team.assign"
  | "team.terminate"
  | "team.role_change"
  | "driver.invite"
  | "carrier.add"
  | "carrier.remove"
  | "load.create"
  | "load.update"
  | "load.delete"
  | "invoice.sent"
  | "invoice.paid"
  | "invoice.partial"
  | "message.sent"
  | "thread.created";

export async function logFreightAction(params: {
  actorId?: string | null;
  actorEmail?: string | null;
  action: FreightAction;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const db = getServiceRoleClient();
  if (!db) return;

  await db.from("freight_action_log").insert({
    actor_id: params.actorId ?? null,
    actor_email: params.actorEmail?.trim().toLowerCase() ?? null,
    action: params.action,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    meta: params.meta ?? {},
  });
}
