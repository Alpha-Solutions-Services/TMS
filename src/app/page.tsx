import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole, roleHomePath } from "@/lib/tms/auth";

export default async function HomePage() {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  const role = await resolveTmsRole(user);
  if (!role) redirect("/login?error=access");
  redirect(roleHomePath(role));
}
