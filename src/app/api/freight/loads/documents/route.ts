import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/freight/api-security";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import {
  DOCUMENT_LABELS,
  fetchLoadNotificationContext,
  getLoadDocumentSignedUrl,
  resolveProfileEmail,
  resolveProfileName,
  uploadLoadDocument,
  type LoadDocumentType,
} from "@/lib/freight/load-documents";
import { sendLoadDocumentUploadedEmail } from "@/lib/freight/emails";
import { FREIGHT_TEAM_EMAIL, PUBLIC_SITE_URL } from "@/lib/freight/constants";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

import { resolveUploadMime, MAX_UPLOAD_BYTES, maxUploadLabelMb } from "@/lib/freight/upload-mime";

const ALLOWED_TYPES = new Set<LoadDocumentType>(["rate_con", "bol", "commodity", "pod"]);

async function resolveCarrierEmail(
  companyName: string,
  carrierProfileId?: string | null,
  fallbackEmail?: string | null,
): Promise<string | null> {
  if (fallbackEmail) return fallbackEmail;
  const admin = getServiceRoleClient();
  if (!admin) return null;
  if (carrierProfileId) {
    const email = await resolveProfileEmail(carrierProfileId);
    if (email) return email;
  }
  const { data } = await admin
    .from("dispatch_carrier_roster")
    .select("email")
    .ilike("company_name", companyName)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  return (data?.email as string) || null;
}

async function notifyDocumentUpload(params: {
  loadId: string;
  type: LoadDocumentType;
  uploaderLabel: string;
  uploaderEmail?: string;
}) {
  const ctx = await fetchLoadNotificationContext(params.loadId);
  if (!ctx) return;

  const label = DOCUMENT_LABELS[params.type];
  const carrierEmail = await resolveCarrierEmail(
    ctx.companyName,
    ctx.carrierProfileId,
    ctx.email,
  );
  const driverEmail = ctx.assignedDriverProfileId
    ? await resolveProfileEmail(ctx.assignedDriverProfileId)
    : null;
  const driverName = ctx.assignedDriverProfileId
    ? await resolveProfileName(ctx.assignedDriverProfileId)
    : "Driver";

  const notify = async (to: string, recipientName: string, portalUrl: string, portalLabel: string) => {
    await sendLoadDocumentUploadedEmail({
      to,
      recipientName,
      loadNumber: ctx.loadNumber,
      documentLabel: label,
      uploadedBy: params.uploaderLabel,
      portalLabel,
      portalUrl,
    }).catch(() => {});
  };

  if (carrierEmail) {
    await notify(
      carrierEmail,
      ctx.companyName,
      `${PUBLIC_SITE_URL}/carrier/loads`,
      "View in carrier portal",
    );
  }

  if (driverEmail && params.type === "rate_con") {
    await notify(
      driverEmail,
      driverName,
      `${PUBLIC_SITE_URL}/driver/dashboard`,
      "Open driver portal",
    );
  }

  if (params.type !== "rate_con") {
    if (FREIGHT_TEAM_EMAIL) {
      await notify(
        FREIGHT_TEAM_EMAIL,
        "Dispatch team",
        `${PUBLIC_SITE_URL}/dispatcher/loads`,
        "View load board",
      );
    }
  }
}

export async function GET(req: NextRequest) {
  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const loadId = req.nextUrl.searchParams.get("loadId")?.trim();
  const docType = req.nextUrl.searchParams.get("type")?.trim() as LoadDocumentType | undefined;

  if (!loadId || !docType || !ALLOWED_TYPES.has(docType)) {
    return NextResponse.json({ error: "loadId and valid type required" }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Service unavailable" }, { status: 500 });

  const { data: load } = await admin
    .from("dispatch_loads")
    .select(
      "id, company_name, carrier_profile_id, assigned_driver_profile_id, rate_con_path, bol_path, commodity_path, pod_path",
    )
    .eq("id", loadId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!load) return NextResponse.json({ error: "Load not found" }, { status: 404 });

  const { data: profile } = await sb
    .from("profiles")
    .select("role, company_name, carrier_id")
    .eq("id", user.id)
    .maybeSingle();

  const isDispatcher = profile && (await assertDispatcher(user));
  const isDriver =
    profile?.role === "driver" && load.assigned_driver_profile_id === user.id;
  const isCarrier =
    profile?.role === "carrier" &&
    (load.carrier_profile_id === user.id ||
      normalizeCarrierMatch(profile, load.company_name as string));

  if (!isDispatcher && !isDriver && !isCarrier) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pathMap: Record<LoadDocumentType, string | null> = {
    rate_con: load.rate_con_path as string | null,
    bol: load.bol_path as string | null,
    commodity: load.commodity_path as string | null,
    pod: load.pod_path as string | null,
  };

  const path = pathMap[docType];
  if (!path) return NextResponse.json({ error: "Document not uploaded yet" }, { status: 404 });

  const url = await getLoadDocumentSignedUrl(path);
  if (!url) return NextResponse.json({ error: "Could not generate URL" }, { status: 500 });

  return NextResponse.json({ url });
}

function normalizeCarrierMatch(
  profile: { carrier_id?: string | null; company_name?: string | null; email?: string | null },
  loadCompany: string,
) {
  return (
    profile.company_name?.toLowerCase().trim() === loadCompany.toLowerCase().trim()
  );
}

export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, "load-documents", 30)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const loadId = String(form.get("loadId") ?? "").trim();
  const docType = String(form.get("type") ?? "").trim() as LoadDocumentType;
  const file = form.get("file");

  if (!loadId || !ALLOWED_TYPES.has(docType) || !(file instanceof File)) {
    return NextResponse.json({ error: "loadId, type, and file required" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${maxUploadLabelMb()}MB)` },
      { status: 400 },
    );
  }

  const resolvedMime = resolveUploadMime(file);
  if (!resolvedMime) {
    return NextResponse.json({ error: "Upload PDF or image (JPG, PNG, WEBP)" }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Service unavailable" }, { status: 500 });

  const { data: load } = await admin
    .from("dispatch_loads")
    .select("id, company_name, carrier_profile_id, assigned_driver_profile_id, email")
    .eq("id", loadId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!load) return NextResponse.json({ error: "Load not found" }, { status: 404 });

  const isDispatcher = await assertDispatcher(user);
  const { data: profile } = await admin
    .from("profiles")
    .select("role, full_name, company_name, carrier_id, email")
    .eq("id", user.id)
    .maybeSingle();

  const isDriver =
    profile?.role === "driver" && load.assigned_driver_profile_id === user.id;
  const isCarrier =
    profile?.role === "carrier" &&
    (load.carrier_profile_id === user.id ||
      normalizeCarrierMatch(profile, load.company_name as string) ||
      (typeof load.email === "string" &&
        profile.email &&
        String(load.email).toLowerCase() === String(profile.email).toLowerCase()));

  const driverDocTypes: LoadDocumentType[] = ["bol", "commodity", "pod"];
  const dispatcherDocTypes: LoadDocumentType[] = ["rate_con", "bol", "commodity", "pod"];
  const carrierDocTypes: LoadDocumentType[] = ["bol", "commodity", "pod"];

  if (isDispatcher && !dispatcherDocTypes.includes(docType)) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }
  if (isDriver && !driverDocTypes.includes(docType)) {
    return NextResponse.json({ error: "Drivers can upload BOL, commodity, and POD only" }, { status: 403 });
  }
  if (isCarrier && !carrierDocTypes.includes(docType)) {
    return NextResponse.json({ error: "Carriers can upload BOL, commodity, and POD only" }, { status: 403 });
  }
  if (!isDispatcher && !isDriver && !isCarrier) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadLoadDocument({
    loadId,
    type: docType,
    file: buffer,
    filename: file.name,
    contentType: resolvedMime,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const uploaderLabel =
    (profile?.full_name as string) || user.email || (isDispatcher ? "Dispatch" : "Driver");

  await notifyDocumentUpload({
    loadId,
    type: docType,
    uploaderLabel,
    uploaderEmail: user.email ?? undefined,
  });

  const url = await getLoadDocumentSignedUrl(result.path);

  return NextResponse.json({ ok: true, path: result.path, url });
}
