import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { promotionSchema, savePromotion, setPromotionActive } from "@/server/services/promotions-admin";

export const PUT = proRoute<{ id: string }>("promotions.manage", async ({ req, viewer, m, params }) => savePromotion(m, viewer.id, await readJson(req, promotionSchema), z.string().uuid().parse(params.id)));

/** Turn a code off or back on without touching its rules. */
export const PATCH = proRoute<{ id: string }>("promotions.manage", async ({ req, viewer, m, params }) =>
  setPromotionActive(m, viewer.id, z.string().uuid().parse(params.id), (await readJson(req, z.object({ isActive: z.boolean() }))).isActive),
);
