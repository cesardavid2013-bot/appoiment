import { proRoute, readJson } from "@/server/http";
import { themeSchema, updateTheme } from "@/server/services/business";

export const PUT = proRoute("business.manage", async ({ req, viewer, m }) => updateTheme(m, viewer.id, await readJson(req, themeSchema)));
