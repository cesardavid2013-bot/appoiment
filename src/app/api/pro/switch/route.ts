import { cookies } from "next/headers";
import { z } from "zod";
import { notFound } from "@/domain/errors";
import { ACTIVE_BUSINESS_COOKIE, listMemberships } from "@/server/authz";
import { readJson, route } from "@/server/http";

export const POST = route({ auth: true }, async ({ req, viewer }) => {
  const { businessId } = await readJson(req, z.object({ businessId: z.string().uuid() }));
  const ms = await listMemberships(viewer.id);
  if (!ms.some((m) => m.businessId === businessId)) throw notFound("That business");
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  return { ok: true };
});
