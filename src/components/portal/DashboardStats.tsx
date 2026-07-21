"use client";

import { motion } from "framer-motion";
import {
  CheckCircle,
  Clock,
  FileText,
  MessageSquare,
  Sparkles,
  Target,
} from "lucide-react";
import clsx from "clsx";

type Stat = {
  number: string;
  label: string;
  icon: typeof Target;
  colorClass: string;
};

export function DashboardStats({
  totalProjects,
  completedProjects,
  inProgressProjects,
  unreadMessages,
  filesCount,
  aiChats,
}: {
  totalProjects: number;
  completedProjects: number;
  inProgressProjects: number;
  unreadMessages: number;
  filesCount: number;
  aiChats: number;
}) {
  const stats: Stat[] = [
    {
      number: String(totalProjects),
      label: "Total projects",
      icon: Target,
      colorClass: "text-sky-400",
    },
    {
      number: String(completedProjects),
      label: "Completed",
      icon: CheckCircle,
      colorClass: "text-emerald-400",
    },
    {
      number: String(inProgressProjects),
      label: "In progress",
      icon: Clock,
      colorClass: "text-amber-400",
    },
    {
      number: String(unreadMessages),
      label: "Unread messages",
      icon: MessageSquare,
      colorClass: "text-[var(--color-accent)]",
    },
    {
      number: String(filesCount),
      label: "Files available",
      icon: FileText,
      colorClass: "text-cyan-300",
    },
    {
      number: String(aiChats),
      label: "AI chats",
      icon: Sparkles,
      colorClass: "text-teal-300",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
          whileHover={{ y: -2 }}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5 transition-shadow hover:shadow-[var(--glow-sm)]"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-3xl font-bold text-[var(--color-text)]">
                {stat.number}
              </p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                {stat.label}
              </p>
            </div>
            <stat.icon
              className={clsx("h-8 w-8 shrink-0", stat.colorClass)}
              aria-hidden
            />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
