import imageUrlBuilder from "@sanity/image-url";
import { getSanityReadClient } from "@/lib/sanity/client";

const CLIENT_PROJECTS = `*[_type == "clientProject" && (clientId == $userId || $userId in coalesce(allowedClientIds, []))] | order(_createdAt desc) {
  _id, title, slug, client, description, status, projectUrl, technologies,
  startDate, endDate, progress,
  milestones[]{ name, status, dueDate },
  team[],
  recentUpdates[]{ date, message, author },
  timelineUpdates[]{ date, title, message, author },
  _createdAt, _updatedAt
}`;

const FILE_UPLOADS = `*[_type == "fileUpload"] | order(coalesce(uploadedAt, uploadDate) desc) {
  _id, clientId,
  project->{ _id, title, clientId },
  fileName, file, fileSize, fileType, mimeType, uploadedBy, projectId, downloadUrl,
  "uploadedAt": coalesce(uploadedAt, uploadDate),
  _createdAt, _updatedAt
}`;

export type PortalProject = {
  id: string;
  name: string;
  description?: string;
  status: string;
  progress: number;
  category: string;
  url?: string;
  dueDate?: string;
  team: string[];
  technologies: string[];
  milestones: { name: string; status: string; dueDate?: string }[];
  recentUpdates: { date?: string; message: string; author?: string }[];
};

export type PortalFile = {
  _id: string;
  clientId?: string;
  fileName: string;
  downloadUrl?: string;
  fileAssetUrl?: string;
  projectTitle?: string;
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function mapStatus(s: string | undefined): string {
  if (!s) return "Planning";
  if (s === "completed") return "Completed";
  if (s === "in-progress") return "In Progress";
  if (s === "planned") return "Planning";
  return s;
}

function mapSanityProject(raw: Record<string, unknown>): PortalProject {
  const milestones = asArray<PortalProject["milestones"][number]>(raw.milestones);
  const timeline = asArray<{
    date?: string;
    message?: string;
    title?: string;
    author?: string;
  }>(raw.timelineUpdates);
  const recent = asArray<PortalProject["recentUpdates"][number]>(raw.recentUpdates);
  const mergedUpdates = [
    ...recent,
    ...timeline.map((t) => ({
      date: t.date,
      message: t.message || t.title || "",
      author: t.author,
    })),
  ].filter((u) => u.message);

  const teamRaw = raw.team as unknown;
  const team = Array.isArray(teamRaw)
    ? (teamRaw as unknown[]).map((t) => String(t)).filter(Boolean)
    : [];
  if (team.length === 0) team.push("Your Dedicated Project Team");

  return {
    id: String(raw._id),
    name: String(raw.title || "Project"),
    description: raw.description ? String(raw.description) : undefined,
    status: mapStatus(raw.status as string),
    progress: typeof raw.progress === "number" ? raw.progress : 0,
    category: "Client Project",
    url: raw.projectUrl ? String(raw.projectUrl) : undefined,
    dueDate: raw.endDate ? String(raw.endDate) : undefined,
    team,
    technologies: asArray<string>(raw.technologies),
    milestones,
    recentUpdates: mergedUpdates,
  };
}

function imageUrlForFile(file: unknown): string | undefined {
  const pid = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "lx58x5y4";
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
  if (!file || typeof file !== "object") return undefined;
  const ref = (file as { asset?: { _ref?: string } }).asset?._ref;
  if (!ref) return undefined;
  try {
    const builder = imageUrlBuilder({ projectId: pid, dataset });
    return builder.image(file as Parameters<typeof builder.image>[0]).url();
  } catch {
    return undefined;
  }
}

export async function fetchPortalDashboardData(userId: string): Promise<{
  projects: PortalProject[];
  files: PortalFile[];
}> {
  const client = getSanityReadClient();
  if (!client) return { projects: [], files: [] };

  try {
    const [rawProjects, rawFiles] = await Promise.all([
      client.fetch<Record<string, unknown>[]>(CLIENT_PROJECTS, { userId }),
      client.fetch<Record<string, unknown>[]>(FILE_UPLOADS),
    ]);

    const projects = (rawProjects || []).map(mapSanityProject);
    const files: PortalFile[] = (rawFiles || [])
      .filter((f) => {
        const cid = f.clientId as string | undefined;
        const proj = f.project as { clientId?: string } | undefined;
        return cid === userId || proj?.clientId === userId;
      })
      .map((f) => {
        const project = f.project as { title?: string } | undefined;
        const dl = f.downloadUrl as string | undefined;
        return {
          _id: String(f._id),
          clientId: f.clientId as string | undefined,
          fileName: String(
            f.fileName ||
              (f.file as { asset?: { originalFilename?: string } })?.asset
                ?.originalFilename ||
              "File"
          ),
          downloadUrl: dl,
          fileAssetUrl: dl || imageUrlForFile(f.file) || undefined,
          projectTitle: project?.title,
        };
      });

    return { projects, files };
  } catch (e) {
    console.error("[portal-data] Sanity fetch failed:", e);
    return { projects: [], files: [] };
  }
}
