"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { CarrierTopBar } from "@/components/freight/carrier/CarrierTopBar";

type Post = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  author_name?: string;
};

type Comment = {
  id: string;
  body: string;
  created_at: string;
  author_name?: string;
};

export function CarrierCommunityClient() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/carrier/community", { cache: "no-store" });
    const json = await res.json();
    if (res.ok) setPosts((json.posts ?? []) as Post[]);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setErr("Could not load feed"));
  }, [refresh]);

  async function createPost() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/carrier/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setTitle("");
      setBody("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function openComments(postId: string) {
    setOpenId(postId);
    const res = await fetch(`/api/carrier/community/${postId}/comments`, {
      cache: "no-store",
    });
    const json = await res.json();
    if (res.ok) setComments((json.comments ?? []) as Comment[]);
  }

  async function addComment() {
    if (!openId || !commentBody.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/carrier/community/${openId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentBody }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setCommentBody("");
      await openComments(openId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <CarrierTopBar title="Community" />
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <p className="text-sm text-[var(--color-muted)]">
          Carrier tips and lane notes — keep it professional.
        </p>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share a tip…"
            rows={3}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy || title.trim().length < 2 || body.trim().length < 2}
            onClick={() => void createPost()}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-40"
          >
            {busy ? "Posting…" : "Post"}
          </button>
          {err ? <p className="text-xs text-red-300">{err}</p> : null}
        </div>

        <ul className="space-y-4">
          {posts.map((p) => (
            <li
              key={p.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-4"
            >
              <p className="text-sm font-semibold text-[var(--color-text)]">{p.title}</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {p.author_name} · {new Date(p.created_at).toLocaleString()}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-text)]">
                {p.body}
              </p>
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--color-accent)]"
                onClick={() => void openComments(p.id)}
              >
                <MessageCircle className="h-3.5 w-3.5" /> Comments
              </button>
              {openId === p.id ? (
                <div className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3">
                  {comments.map((c) => (
                    <div key={c.id} className="text-xs">
                      <span className="text-[var(--color-accent)]">{c.author_name}</span>
                      <span className="text-[var(--color-muted)]"> — {c.body}</span>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-1.5 text-xs"
                      placeholder="Add a comment"
                    />
                    <button
                      type="button"
                      disabled={busy || !commentBody.trim()}
                      onClick={() => void addComment()}
                      className="rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs disabled:opacity-40"
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Send"}
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
