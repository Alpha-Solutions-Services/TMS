import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";

export default async function HomePage() {
  const user = await getPortalUser();
  if (!user) redirect("/freight/login");
  const role = await resolveTmsRole(user);
  switch (role) {
    case "super_dispatcher":
    case "sub_dispatcher":
      redirect("/freight/dispatcher/dashboard");
    case "carrier":
      redirect("/freight/carrier/dashboard");
    case "driver":
      redirect("/freight/driver/dashboard");
    default:
      redirect("/freight/login");
  }
}
