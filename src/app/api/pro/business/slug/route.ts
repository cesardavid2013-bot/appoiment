import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { changeSlug } from "@/server/services/business";

export const PUT = proRoute("business.manage", async ({ req, viewer, m }) => changeSlug(m, viewer.id, (await readJson(req, z.object({ slug: z.string().max(60) }))).slug));
