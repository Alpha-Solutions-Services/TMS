import { getServiceRoleClient } from "@/lib/supabase/service-role";

export type CommunityPost = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  author_profile_id: string;
  author_name?: string;
};

export type CommunityComment = {
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  author_profile_id: string;
  author_name?: string;
};

async function nameMap(ids: string[]) {
  const admin = getServiceRoleClient();
  if (!admin || !ids.length) return new Map<string, string>();
  const { data } = await admin
    .from("profiles")
    .select("id, company_name, full_name")
    .in("id", Array.from(new Set(ids)));
  const map = new Map<string, string>();
  for (const p of data ?? []) {
    map.set(
      p.id as string,
      (p.company_name as string) || (p.full_name as string) || "Carrier",
    );
  }
  return map;
}

export async function listCommunityPosts(limit = 40) {
  const admin = getServiceRoleClient();
  if (!admin) return [] as CommunityPost[];
  const { data, error } = await admin
    .from("tms_community_posts")
    .select("id, title, body, created_at, author_profile_id")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const names = await nameMap(data.map((d) => d.author_profile_id as string));
  return data.map((d) => ({
    ...(d as CommunityPost),
    author_name: names.get(d.author_profile_id as string) || "Carrier",
  }));
}

export async function createCommunityPost(params: {
  authorProfileId: string;
  title: string;
  body: string;
}) {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" as const };
  const { data, error } = await admin
    .from("tms_community_posts")
    .insert({
      author_profile_id: params.authorProfileId,
      title: params.title.trim(),
      body: params.body.trim(),
    })
    .select("id, title, body, created_at, author_profile_id")
    .single();
  if (error || !data) return { error: error?.message ?? "Insert failed" };
  return { row: data as CommunityPost };
}

export async function listComments(postId: string) {
  const admin = getServiceRoleClient();
  if (!admin) return [] as CommunityComment[];
  const { data } = await admin
    .from("tms_community_comments")
    .select("id, post_id, body, created_at, author_profile_id")
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(100);
  const rows = (data ?? []) as CommunityComment[];
  const names = await nameMap(rows.map((r) => r.author_profile_id));
  return rows.map((r) => ({
    ...r,
    author_name: names.get(r.author_profile_id) || "Carrier",
  }));
}

export async function createComment(params: {
  postId: string;
  authorProfileId: string;
  body: string;
}) {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" as const };
  const { data, error } = await admin
    .from("tms_community_comments")
    .insert({
      post_id: params.postId,
      author_profile_id: params.authorProfileId,
      body: params.body.trim(),
    })
    .select("id, post_id, body, created_at, author_profile_id")
    .single();
  if (error || !data) return { error: error?.message ?? "Insert failed" };
  return { row: data as CommunityComment };
}
