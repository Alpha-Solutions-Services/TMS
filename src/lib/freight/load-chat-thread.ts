import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { getSuperDispatcherAllowlistEmails } from "@/lib/tms/super-users";
import { resolveProfileEmail } from "./load-documents";

export type LoadThreadSummary = {
  id: string;
  load_id: string;
  load_number: string;
  title: string;
  updated_at: string;
};

export async function ensureLoadChatThread(
  loadId: string,
  createdBy: string,
): Promise<string | null> {
  const db = getServiceRoleClient();
  if (!db) return null;

  const { data: existing } = await db
    .from("freight_threads")
    .select("id")
    .eq("load_id", loadId)
    .eq("thread_type", "load")
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: load } = await db
    .from("dispatch_loads")
    .select(
      "id, load_number, sr, company_name, carrier_profile_id, assigned_driver_profile_id, email",
    )
    .eq("id", loadId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!load) return null;

  const loadNumber =
    (load.load_number as string)?.trim() || `SR-${load.sr}`;
  const title = `Load ${loadNumber} — ${load.company_name}`;

  const { data: thread, error } = await db
    .from("freight_threads")
    .insert({
      title,
      thread_type: "load",
      load_id: loadId,
      load_number: loadNumber,
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (error || !thread) {
    console.error("[load-chat-thread] create failed:", error);
    return null;
  }

  const memberSet = new Set<string>();
  memberSet.add(createdBy);

  if (load.carrier_profile_id) memberSet.add(load.carrier_profile_id as string);
  if (load.assigned_driver_profile_id) {
    memberSet.add(load.assigned_driver_profile_id as string);
  }

  const superEmails = getSuperDispatcherAllowlistEmails();
  const { data: authUsers } = await db.auth.admin.listUsers();
  for (const email of superEmails) {
    const superUser = authUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email,
    );
    if (superUser?.id) memberSet.add(superUser.id);
  }

  if (load.email) {
    const carrierEmail = String(load.email).trim().toLowerCase();
    const carrierUser = authUsers?.users?.find(
      (u) => u.email?.toLowerCase() === carrierEmail,
    );
    if (carrierUser?.id) memberSet.add(carrierUser.id);
  }

  const rows = Array.from(memberSet).map((uid) => ({
    thread_id: thread.id,
    user_id: uid,
    role: uid === createdBy ? "creator" : "member",
  }));

  await db.from("freight_thread_members").insert(rows);

  const carrierEmail = load.carrier_profile_id
    ? await resolveProfileEmail(load.carrier_profile_id as string)
    : null;
  const driverEmail = load.assigned_driver_profile_id
    ? await resolveProfileEmail(load.assigned_driver_profile_id as string)
    : null;

  await db.from("freight_thread_messages").insert({
    thread_id: thread.id,
    sender_id: createdBy,
    sender_role: "system",
    body: `Load chat opened for ${loadNumber}. Participants: dispatch, carrier${driverEmail ? ", driver" : ""}.${carrierEmail ? ` Carrier email: ${carrierEmail}.` : ""}`,
    attachments: [],
  });

  return thread.id;
}

export async function listLoadThreadsForUser(userId: string): Promise<LoadThreadSummary[]> {
  const db = getServiceRoleClient();
  if (!db) return [];

  const { data: memberships } = await db
    .from("freight_thread_members")
    .select("thread_id")
    .eq("user_id", userId);

  const threadIds = (memberships ?? []).map((m) => m.thread_id);
  if (threadIds.length === 0) return [];

  const { data: threads } = await db
    .from("freight_threads")
    .select("id, load_id, load_number, title, updated_at, thread_type")
    .in("id", threadIds)
    .eq("thread_type", "load")
    .order("updated_at", { ascending: false });

  return (threads ?? []).map((t) => ({
    id: t.id as string,
    load_id: t.load_id as string,
    load_number: (t.load_number as string) || "",
    title: t.title as string,
    updated_at: t.updated_at as string,
  }));
}
