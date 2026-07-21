"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart3,
  Calendar,
  FileSignature,
  FileText,
  FolderKanban,
  MessageSquare,
  Sparkles,
  Ticket,
} from "lucide-react";
import clsx from "clsx";
import type { PortalFile, PortalProject } from "@/lib/sanity/portal-data";
import { ProjectCard } from "./ProjectCard";
import { FileLibrary } from "./FileLibrary";
import {
  ProjectProgressView,
  type CrmProject,
} from "./ProjectProgressView";
import { TicketsPanel } from "./TicketsPanel";
import {
  ClientContractsPanel,
  ClientQuotesPanel,
  ClientSchedulePanel,
} from "./ClientSystemPanels";

const DashboardStats = dynamic(
  () => import("./DashboardStats").then((m) => m.DashboardStats),
  { ssr: false }
);
const WhatsAppChat = dynamic(
  () =>
    import("@/components/chat/WhatsAppChat").then((m) => m.WhatsAppChat),
  { ssr: false }
);
const AiChatPanel = dynamic(
  () => import("@/components/ai/AiChatPanel").then((m) => m.AiChatPanel),
  { ssr: false }
);

const WHATSAPP_DIGITS = "923494206922";

const tabs = [
  { id: "overview" as const, label: "Overview", icon: BarChart3 },
  { id: "projects" as const, label: "Projects", icon: FolderKanban },
  { id: "quotes" as const, label: "Quotes", icon: FileText },
  { id: "contracts" as const, label: "Contracts", icon: FileSignature },
  { id: "schedule" as const, label: "Schedule", icon: Calendar },
  { id: "tickets" as const, label: "Tickets", icon: Ticket },
  { id: "files" as const, label: "Files", icon: FileText },
  { id: "messages" as const, label: "Messages", icon: MessageSquare },
  { id: "ai" as const, label: "Assistant", icon: Sparkles },
];

export function PortalDashboardClient({
  projects: sanityProjects,
  files,
}: {
  projects: PortalProject[];
  files: PortalFile[];
}) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const projectParam = searchParams.get("project");
  const [activeTab, setActiveTab] =
    useState<(typeof tabs)[number]["id"]>("overview");
  const [crmProjects, setCrmProjects] = useState<CrmProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<CrmProject | null>(
    null
  );
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [aiChats, setAiChats] = useState(0);

  useEffect(() => {
    if (tabParam && tabs.some((t) => t.id === tabParam)) {
      setActiveTab(tabParam as (typeof tabs)[number]["id"]);
    }
  }, [tabParam]);

  useEffect(() => {
    void fetch("/api/projects")
      .then((r) => r.json())
      .then((j: { projects?: CrmProject[] }) => {
        const list = j.projects ?? [];
        setCrmProjects(list);
        if (projectParam) {
          const found = list.find((p) => p.id === projectParam);
          if (found) {
            setSelectedProject(found);
            setActiveTab("projects");
          }
        }
      })
      .catch(() => {});
  }, [projectParam]);

  useEffect(() => {
    void fetch("/api/portal/stats")
      .then((r) => r.json())
      .then((j: { unreadMessages?: number; aiChats?: number }) => {
        setUnreadMessages(j.unreadMessages ?? 0);
        setAiChats(j.aiChats ?? 0);
      })
      .catch(() => {});
  }, [activeTab]);

  const completedProjects = useMemo(
    () =>
      crmProjects.filter((p) => p.status === "completed").length +
      sanityProjects.filter((p) => p.status === "Completed").length,
    [crmProjects, sanityProjects]
  );
  const inProgressProjects = useMemo(
    () =>
      crmProjects.filter((p) => p.status === "in_progress").length +
      sanityProjects.filter((p) => p.status === "In Progress").length,
    [crmProjects, sanityProjects]
  );
  const totalProjects = crmProjects.length + sanityProjects.length;

  function openWhatsApp() {
    const text = encodeURIComponent(
      "Hello Alpha Solutions team, I have a question about my project:"
    );
    window.open(`https://wa.me/${WHATSAPP_DIGITS}?text=${text}`, "_blank");
  }

  return (
    <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:p-8">
      <header className="mb-8">
        <h1
          className="text-2xl font-bold text-[var(--color-text)] md:text-3xl"
          style={{ fontFamily: "var(--font-display), sans-serif" }}
        >
          Client portal
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Projects, tickets, files, messaging, and Alpha Assistant — all in one
          place.
        </p>
      </header>

      <div
        className="mb-8 flex flex-wrap gap-2 border-b border-[var(--color-border)] pb-4"
        role="tablist"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id !== "projects") setSelectedProject(null);
            }}
            className={clsx(
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                : "text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
            )}
          >
            <tab.icon className="h-4 w-4 shrink-0" aria-hidden />
            {tab.label}
            {tab.id === "messages" && unreadMessages > 0 ? (
              <span className="rounded-full bg-[var(--color-accent)] px-1.5 text-[10px] font-bold text-[#05080f]">
                {unreadMessages}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {activeTab === "overview" ? (
          <div className="space-y-8">
            <DashboardStats
              totalProjects={totalProjects}
              completedProjects={completedProjects}
              inProgressProjects={inProgressProjects}
              unreadMessages={unreadMessages}
              filesCount={files.length}
              aiChats={aiChats}
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setActiveTab("tickets")}
                className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f]"
              >
                Create ticket
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ai")}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-accent)]"
              >
                Ask Assistant
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("messages")}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)]"
              >
                Message team
              </button>
            </div>
            {crmProjects.length > 0 ? (
              <section>
                <h2 className="mb-4 text-lg font-semibold text-[var(--color-text)]">
                  Active projects
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {crmProjects.slice(0, 4).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedProject(p);
                        setActiveTab("projects");
                      }}
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-4 text-left hover:border-[var(--color-accent)]/50"
                    >
                      <p className="font-semibold text-[var(--color-text)]">
                        {p.title}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-muted)]">
                        {p.progress}% complete
                      </p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-border)]">
                        <div
                          className="h-full bg-[var(--color-accent)]"
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ) : sanityProjects.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {sanityProjects.slice(0, 4).map((p) => (
                  <ProjectCard key={p.id} project={p} compact />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
                <p className="text-sm text-[var(--color-muted)]">
                  Your projects will appear here once assigned.
                </p>
                <button
                  type="button"
                  onClick={openWhatsApp}
                  className="mt-4 text-sm text-[var(--color-accent)] hover:underline"
                >
                  WhatsApp the team
                </button>
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "projects" ? (
          selectedProject ? (
            <div>
              <button
                type="button"
                className="mb-4 text-sm text-[var(--color-accent)]"
                onClick={() => setSelectedProject(null)}
              >
                ← All projects
              </button>
              <ProjectProgressView
                project={selectedProject}
                mode="client"
                onRefresh={(p) => {
                  setSelectedProject(p);
                  setCrmProjects((prev) =>
                    prev.map((x) => (x.id === p.id ? p : x))
                  );
                }}
              />
            </div>
          ) : (
            <div className="space-y-6">
              {crmProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProject(p)}
                  className="block w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-5 text-left hover:border-[var(--color-accent)]/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[var(--color-text)]">
                      {p.title}
                    </p>
                    <span className="text-xs text-[var(--color-muted)]">
                      {p.progress}%
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-border)]">
                    <div
                      className="h-full bg-[var(--color-accent)]"
                      style={{ width: `${p.progress}%` }}
                    />
                  </div>
                </button>
              ))}
              {sanityProjects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
              {crmProjects.length === 0 && sanityProjects.length === 0 ? (
                <p className="text-center text-[var(--color-muted)]">
                  No projects yet.
                </p>
              ) : null}
            </div>
          )
        ) : null}

        {activeTab === "tickets" ? <TicketsPanel mode="client" /> : null}

        {activeTab === "quotes" ? <ClientQuotesPanel /> : null}
        {activeTab === "contracts" ? <ClientContractsPanel /> : null}
        {activeTab === "schedule" ? <ClientSchedulePanel /> : null}

        {activeTab === "files" ? <FileLibrary files={files} /> : null}

        {activeTab === "messages" ? (
          <div className="space-y-4">
            <WhatsAppChat mode="client" />
          </div>
        ) : null}

        {activeTab === "ai" ? <AiChatPanel /> : null}
      </motion.div>
    </div>
  );
}
