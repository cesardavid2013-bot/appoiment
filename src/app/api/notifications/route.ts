import { z } from "zod";
import { readJson, readQuery, route } from "@/server/http";
import { listNotifications, markNotificationsRead } from "@/server/services/engagement";

export const GET = route({ auth: true }, async ({ req, viewer }) => {
  const { before } = readQuery(req, z.object({ before: z.string().datetime().optional() }));
  return listNotifications(viewer.id, before ? new Date(before) : undefined);
});

export const POST = route({ auth: true }, async ({ req, viewer }) => {
  const { ids } = await readJson(req, z.object({ ids: z.array(z.string().uuid()).max(100).optional() }));
  await markNotificationsRead(viewer.id, ids);
  return { ok: true };
});
