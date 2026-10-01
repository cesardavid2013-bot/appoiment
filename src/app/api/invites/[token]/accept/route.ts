import { cookies } from "next/headers";
import { route } from "@/server/http";
import { ACTIVE_BUSINESS_COOKIE } from "@/server/authz";
import { acceptInvite } from "@/server/services/team";

export const POST = route<{ token: string }>({ auth: true }, async ({ viewer, params }) => {
  const res = await acceptInvite(viewer, params.token.slice(0, 100));
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, res.businessId, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  return res;
});
