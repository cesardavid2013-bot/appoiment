import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { promotionSchema, savePromotion } from "@/server/services/promotions-admin";

export const PUT = proRoute<{ id: string }>("promotions.manage", async ({ req, viewer, m, params }) => savePromotion(m, viewer.id, await readJson(req, promotionSchema), z.string().uuid().parse(params.id)));
