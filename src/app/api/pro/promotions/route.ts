import { proRoute, readJson } from "@/server/http";
import { promotionSchema, savePromotion } from "@/server/services/promotions-admin";

export const POST = proRoute("promotions.manage", async ({ req, viewer, m }) => savePromotion(m, viewer.id, await readJson(req, promotionSchema)));
