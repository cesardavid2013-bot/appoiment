import { proRoute, readJson } from "@/server/http";
import { blockSchema, createBlock } from "@/server/services/schedule";

export const POST = proRoute(["schedule.manage_own", "schedule.manage_all"], async ({ req, viewer, m }) => createBlock(m, viewer.id, await readJson(req, blockSchema)));
