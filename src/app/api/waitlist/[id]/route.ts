import { z } from "zod";
import { route } from "@/server/http";
import { leaveWaitlist } from "@/server/services/engagement";

export const DELETE = route<{ id: string }>({ auth: true }, async ({ viewer, params }) => {
  await leaveWaitlist(viewer, z.string().uuid().parse(params.id));
  return { ok: true };
});
