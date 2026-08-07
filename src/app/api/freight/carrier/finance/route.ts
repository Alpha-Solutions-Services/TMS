import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import {
  createExpense,
  createFuelLog,
  deleteExpense,
  deleteFuelLog,
  EXPENSE_CATEGORIES,
  listExpenses,
  listFuelLogs,
  syncAndListSettlements,
  updateSettlement,
  buildFinanceSnapshot,
} from "@/lib/freight/carrier-finance";
import { requireCarrierSession } from "@/lib/freight/require-carrier";

/** GET ?view=summary|expenses|fuel|settlements */
export async function GET(req: NextRequest) {
  if (!checkRateLimit(req, "carrier-finance-get", 60)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const session = await requireCarrierSession({ verified: true });
  if (session.error) return session.error;
  const carrierId = session.user.id;
  const companyName =
    (session.profile.company_name as string) ||
    (session.profile.full_name as string) ||
    "";
  const view = req.nextUrl.searchParams.get("view") || "summary";

  if (view === "expenses") {
    return NextResponse.json({
      expenses: await listExpenses(carrierId),
      categories: EXPENSE_CATEGORIES,
    });
  }
  if (view === "fuel") {
    return NextResponse.json({ fuel: await listFuelLogs(carrierId) });
  }
  if (view === "settlements") {
    return NextResponse.json({
      settlements: await syncAndListSettlements(carrierId, companyName),
    });
  }

  // summary — need drivers from profiles
  const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = getServiceRoleClient();
  const drivers: {
    driver_id: string;
    name: string;
    status: string;
    truck_number?: string | null;
  }[] = [];
  if (admin) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, driver_status")
      .eq("role", "driver")
      .eq("carrier_id", carrierId);
    for (const d of data ?? []) {
      drivers.push({
        driver_id: d.id as string,
        name: (d.full_name as string) || "Driver",
        status:
          String(d.driver_status || "active").toLowerCase() === "active"
            ? "Active"
            : String(d.driver_status || "active"),
      });
    }
  }

  const snapshot = await buildFinanceSnapshot({
    carrierId,
    companyName,
    drivers,
  });
  return NextResponse.json({
    ...snapshot,
    categories: EXPENSE_CATEGORIES,
  });
}

const postSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("expense"),
    category: z.string().min(1).max(60),
    amount: z.number(),
    expenseDate: z.string().optional(),
    label: z.string().max(120).optional(),
    truckId: z.string().uuid().nullable().optional(),
    driverProfileId: z.string().uuid().nullable().optional(),
    notes: z.string().max(300).optional(),
  }),
  z.object({
    kind: z.literal("fuel"),
    logDate: z.string().optional(),
    truckId: z.string().uuid().nullable().optional(),
    driverProfileId: z.string().uuid().nullable().optional(),
    location: z.string().max(120).optional(),
    gallons: z.number(),
    cost: z.number(),
    odometer: z.number().nullable().optional(),
    notes: z.string().max(300).optional(),
  }),
]);

export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, "carrier-finance-post", 40)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const session = await requireCarrierSession({ verified: true });
  if (session.error) return session.error;
  const carrierId = session.user.id;

  try {
    const body = postSchema.parse(await req.json());
    if (body.kind === "expense") {
      const result = await createExpense({
        carrierId,
        category: body.category,
        amount: body.amount,
        expenseDate: body.expenseDate,
        label: body.label,
        truckId: body.truckId,
        driverProfileId: body.driverProfileId,
        notes: body.notes,
      });
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, expense: result.row });
    }
    const result = await createFuelLog({
      carrierId,
      logDate: body.logDate,
      truckId: body.truckId,
      driverProfileId: body.driverProfileId,
      location: body.location,
      gallons: body.gallons,
      cost: body.cost,
      odometer: body.odometer,
      notes: body.notes,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, fuel: result.row });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const patchSchema = z.object({
  kind: z.literal("settlement"),
  id: z.string().uuid(),
  status: z.string().max(40).optional(),
  dueDate: z.string().nullable().optional(),
  paymentDate: z.string().nullable().optional(),
  notes: z.string().max(400).nullable().optional(),
  balance: z.number().optional(),
});

export async function PATCH(req: NextRequest) {
  if (!checkRateLimit(req, "carrier-finance-patch", 40)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const session = await requireCarrierSession({ verified: true });
  if (session.error) return session.error;

  try {
    const body = patchSchema.parse(await req.json());
    const result = await updateSettlement({
      carrierId: session.user.id,
      id: body.id,
      status: body.status,
      dueDate: body.dueDate,
      paymentDate: body.paymentDate,
      notes: body.notes,
      balance: body.balance,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, settlement: result.row });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!checkRateLimit(req, "carrier-finance-delete", 30)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const session = await requireCarrierSession({ verified: true });
  if (session.error) return session.error;
  const kind = req.nextUrl.searchParams.get("kind");
  const id = req.nextUrl.searchParams.get("id");
  if (!kind || !id) {
    return NextResponse.json({ error: "kind and id required" }, { status: 400 });
  }
  if (kind === "expense") {
    const r = await deleteExpense(session.user.id, id);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (kind === "fuel") {
    const r = await deleteFuelLog(session.user.id, id);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
}
