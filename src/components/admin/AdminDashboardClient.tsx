"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  BarChart3,
  BookOpen,
  Calendar,
  FileSignature,
  FolderKanban,
  GitBranch,
  Inbox,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import { TicketsPanel } from "@/components/portal/TicketsPanel";
import { AdminProjectsPanel } from "@/components/admin/AdminProjectsPanel";
import { AdminAiInbox } from "@/components/admin/AdminAiInbox";
import { AdminInquiriesPanel } from "@/components/admin/AdminInquiriesPanel";
import {
  AdminPipelinePanel,
  AdminQuotesContractsPanel,
  AdminSchedulePanel,
  AdminKnowledgePanel,
  AdminReportsPanel,
  AdminStaffPanel,
} from "@/components/admin/AdminSystemPanels";
import { useUi } from "@/components/ui/UiProvider";

const WhatsAppChat = dynamic(
  () =>
    import("@/components/chat/WhatsAppChat").then((m) => m.WhatsAppChat),
  { ssr: false }
);

type Stats = {
  inquiriesTotal: number;
  inquiriesNew: number;
  activeClientThreads: number;
  unreadClientMessages: number;
  messagesLast7Days: number;
  pageViewsLast7Days: number;
};

type Inquiry = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string | null;
  budget: string | null;
  service_slug: string;
  message: string;
  status: string;
};

type ThreadRow = {
  id: string;
  client_user_id: string;
  client_email: string | null;
  updated_at: string;
  messageCount: number;
  unread: number;
  lastMessage: { body: string; created_at: string; is_admin: boolean } | null;
};

const tabs = [
  { id: "overview" as const, label: "Overview", icon: BarChart3 },
  { id: "pipeline" as const, label: "Pipeline", icon: GitBranch },
  { id: "quotes" as const, label: "Quotes", icon: FileSignature },
  { id: "schedule" as const, label: "Schedule", icon: Calendar },
  { id: "projects" as const, label: "Projects", icon: FolderKanban },
  { id: "tickets" as const, label: "Tickets", icon: Ticket },
  { id: "ai" as const, label: "Assistant", icon: Sparkles },
  { id: "knowledge" as const, label: "Knowledge", icon: BookOpen },
  { id: "reports" as const, label: "Reports", icon: BarChart3 },
  { id: "staff" as const, label: "Staff", icon: Users },
  { id: "inquiries" as const, label: "Inquiries", icon: Inbox },
  { id: "clients" as const, label: "Chat", icon: MessageSquare },
];

export function AdminDashboardClient() {
  const searchParams = useSearchParams();
  const { toast } = useUi();
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const aiConvId = searchParams.get("c");

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && tabs.some((x) => x.id === t)) {
      setTab(t as (typeof tabs)[number]["id"]);
    }
  }, [searchParams]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setLoadErr(null);
    try {
      const [sRes, iRes, tRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/admin/inquiries"),
        fetch("/api/admin/threads"),
      ]);
      if (!sRes.ok) throw new Error("Stats failed");
      setStats((await sRes.json()) as Stats);
      if (iRes.ok) {
        const ij = (await iRes.json()) as { inquiries?: Inquiry[] };
        setInquiries(ij.inquiries ?? []);
      }
      if (tRes.ok) {
        const tj = (await tRes.json()) as { threads?: ThreadRow[] };
        setThreads(tj.threads ?? []);
      }
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onComposeAssist(action: "draft" | "summarize" | "next") {
    if (!selectedThread) return;
    const res = await fetch("/api/ai/assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, threadId: selectedThread }),
    });
    const j = (await res.json()) as { text?: string };
    return j.text || "";
  }

  async function patchInquiry(id: string, status: string) {
    try {
      const res = await fetch(`/api/admin/inquiries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update failed");
      toast({ kind: "success", title: "Status updated" });
      void refresh();
    } catch {
      toast({ kind: "error", title: "Could not update status" });
    }
  }

  return (
    <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold text-[var(--color-text)] md:text-3xl"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Admin CRM
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Projects, tickets, Assistant chats, inquiries, and client messaging.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:opacity-50"
        >
          <RefreshCw className={clsx("h-4 w-4", busy && "animate-spin")} />
          Refresh
        </button>
      </header>

      {loadErr ? <p className="mb-6 text-sm text-red-400">{loadErr}</p> : null}

      <div
        className="mb-8 flex gap-2 overflow-x-auto border-b border-[var(--color-border)] pb-4"
        role="tablist"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                : "text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {tab === "overview" && stats ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["Total inquiries", stats.inquiriesTotal],
                ["New inquiries", stats.inquiriesNew],
                ["Client chat threads", stats.activeClientThreads],
                ["Unread client messages", stats.unreadClientMessages],
                ["Messages (7 days)", stats.messagesLast7Days],
                ["Page views (7 days)", stats.pageViewsLast7Days],
              ] as const
            ).map(([label, val], i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-6"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  {label}
                </p>
                <p
                  className="mt-2 text-3xl font-bold text-[var(--color-text)]"
                  style={{ fontFamily: "var(--font-display), sans-serif" }}
                >
                  {val}
                </p>
              </motion.div>
            ))}
          </div>
        ) : null}

        {tab === "pipeline" ? <AdminPipelinePanel /> : null}
        {tab === "quotes" ? <AdminQuotesContractsPanel /> : null}
        {tab === "schedule" ? <AdminSchedulePanel /> : null}
        {tab === "knowledge" ? <AdminKnowledgePanel /> : null}
        {tab === "reports" ? <AdminReportsPanel /> : null}
        {tab === "staff" ? <AdminStaffPanel /> : null}
        {tab === "projects" ? <AdminProjectsPanel /> : null}
        {tab === "tickets" ? <TicketsPanel mode="admin" /> : null}
        {tab === "ai" ? <AdminAiInbox initialId={aiConvId} /> : null}

        {tab === "inquiries" ? (
          <AdminInquiriesPanel
            inquiries={inquiries}
            onRefresh={() => void refresh()}
            onPatchStatus={patchInquiry}
          />
        ) : null}

        {tab === "clients" ? (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/20">
              <div className="border-b border-[var(--color-border)] p-4">
                <h2 className="font-semibold text-[var(--color-text)]">
                  Client threads
                </h2>
              </div>
              <ul className="max-h-[560px] divide-y divide-[var(--color-border)] overflow-y-auto">
                {threads.map((th) => (
                  <li key={th.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedThread(th.id)}
                      className={clsx(
                        "w-full px-4 py-3 text-left text-sm hover:bg-[var(--color-surface)]/50",
                        selectedThread === th.id &&
                          "bg-[var(--color-accent-dim)]/30"
                      )}
                    >
                      <div className="font-medium text-[var(--color-text)]">
                        {th.client_email || th.client_user_id.slice(0, 8)}
                      </div>
                      <div className="text-xs text-[var(--color-muted)]">
                        {th.messageCount} messages
                        {th.unread > 0 ? ` · ${th.unread} unread` : ""}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <WhatsAppChat
              mode="admin"
              threadId={selectedThread}
              onComposeAssist={onComposeAssist}
            />
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}
