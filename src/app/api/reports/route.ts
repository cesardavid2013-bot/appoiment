import { readJson, route } from "@/server/http";
import { createReport, reportSchema } from "@/server/services/engagement";

export const POST = route({ auth: true }, async ({ req, viewer }) => createReport(viewer, await readJson(req, reportSchema)));
