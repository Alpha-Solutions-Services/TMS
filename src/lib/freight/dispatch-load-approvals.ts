import { getServiceRoleClient } from "@/lib/supabase/service-role";

export type DispatchApprovalAction = "create" | "update" | "delete";
export type DispatchApprovalStatus = "pending" | "approved" | "rejected";

export type DispatchLoadApproval = {
  id: string;
  load_id: string | null;
  action: DispatchApprovalAction;
  payload: Record<string, unknown>;
  status: DispatchApprovalStatus;
  requested_by: string;
  requested_by_email: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export async function insertDispatchLoadApproval(opts: {
  loadId?: string | null;
  action: DispatchApprovalAction;
  payload: Record<string, unknown>;
  requestedBy: string;
  requestedByEmail?: string | null;
}): Promise<DispatchLoadApproval | null> {
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("dispatch_load_approvals")
    .insert({
      load_id: opts.loadId ?? null,
      action: opts.action,
      payload: opts.payload,
      requested_by: opts.requestedBy,
      requested_by_email: opts.requestedByEmail?.trim() || null,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    console.error("[dispatch-load-approvals] insert failed:", error.message);
    return null;
  }
  return data as DispatchLoadApproval;
}

export async function listPendingDispatchLoadApprovals(): Promise<DispatchLoadApproval[]> {
  const admin = getServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("dispatch_load_approvals")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[dispatch-load-approvals] list failed:", error.message);
    return [];
  }
  return (data ?? []) as DispatchLoadApproval[];
}

export async function resolveDispatchLoadApproval(opts: {
  id: string;
  status: "approved" | "rejected";
  reviewedBy: string;
  reviewNote?: string;
}): Promise<DispatchLoadApproval | null> {
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("dispatch_load_approvals")
    .update({
      status: opts.status,
      reviewed_by: opts.reviewedBy,
      review_note: opts.reviewNote?.trim() || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", opts.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[dispatch-load-approvals] resolve failed:", error.message);
    return null;
  }
  return (data as DispatchLoadApproval) ?? null;
}
