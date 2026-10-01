import { z } from "zod";
import { readJson, route } from "@/server/http";
import { startTip } from "@/server/services/payments";

export const POST = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  const { amountCents } = await readJson(req, z.object({ amountCents: z.number().int().min(100).max(100_000) }));
  return startTip(viewer.id, z.string().uuid().parse(params.id), amountCents);
});
