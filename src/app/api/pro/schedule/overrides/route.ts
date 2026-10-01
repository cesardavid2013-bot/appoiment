import { proRoute, readJson } from "@/server/http";
import { overrideSchema, setOverride } from "@/server/services/schedule";

export const POST = proRoute(["schedule.manage_own", "schedule.manage_all"], async ({ req, viewer, m }) => {
  await setOverride(m, viewer.id, await readJson(req, overrideSchema));
  return { ok: true };
});
