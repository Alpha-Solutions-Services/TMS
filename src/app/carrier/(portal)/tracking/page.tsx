import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CarrierTrackingClient } from "@/components/freight/CarrierTrackingClient";
import { createClient } from "@/lib/supabase/server";
import { isVerifiedCarrier } from "@/lib/freight/carrier-identity";

export const metadata: Metadata = {
  title: "Tracking — Carrier",
};

export const dynamic = "force-dynamic";

export default async function CarrierTrackingPage() {
  const sb = await createClient();
  if (!sb) redirect("/login");
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) redirect("/login");
  const { data: profile } = await sb
    .from("profiles")
    .select("role, carrier_status")
    .eq("id", user.id)
    .maybeSingle();
  if (!isVerifiedCarrier(profile)) redirect("/login");

  return <CarrierTrackingClient />;
}
