import { redirect } from "next/navigation";
import { getActiveMembership } from "@/server/authz";
import { getViewer } from "@/server/auth/session";

export default async function ProIndex() {
  const viewer = (await getViewer())!;
  const m = await getActiveMembership(viewer);
  redirect(m ? "/pro/today" : "/pro/onboarding");
}
