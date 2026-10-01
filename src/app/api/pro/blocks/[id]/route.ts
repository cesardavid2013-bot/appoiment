import { z } from "zod";
import { proRoute } from "@/server/http";
import { deleteBlock } from "@/server/services/schedule";

export const DELETE = proRoute<{ id: string }>(["schedule.manage_own", "schedule.manage_all"], async ({ viewer, m, params }) => {
  await deleteBlock(m, viewer.id, z.string().uuid().parse(params.id));
  return { ok: true };
});
