import { readJson, route } from "@/server/http";
import { createBusiness, createBusinessSchema } from "@/server/services/business";
import { cookies } from "next/headers";
import { ACTIVE_BUSINESS_COOKIE } from "@/server/authz";

export const POST = route({ auth: true }, async ({ req, viewer }) => {
  const res = await createBusiness(viewer, await readJson(req, createBusinessSchema));
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, res.id, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  return res;
});
