import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DispatcherChatClient } from "@/components/freight/DispatcherChatClient";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { canChatWithCarriers, dispatcherLandingPath } from "@/lib/tms/permissions";

export const metadata: Metadata = {
  title: "Chat — Dispatcher",
};

export default async function DispatcherChatPage() {
  const user = await getPortalUser();
  const role = await resolveTmsRole(user);
  if (!canChatWithCarriers(role)) redirect(dispatcherLandingPath(role));

  return <DispatcherChatClient />;
}
