import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { respondToReview } from "@/server/services/engagement";

export const POST = proRoute<{ id: string }>("reviews.respond", async ({ req, viewer, m, params }) => {
  await respondToReview(m, viewer.id, z.string().uuid().parse(params.id), (await readJson(req, z.object({ body: z.string().max(1500) }))).body);
  return { ok: true };
});
