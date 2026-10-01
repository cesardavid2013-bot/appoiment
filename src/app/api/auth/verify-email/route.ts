import { z } from "zod";
import { readJson, route } from "@/server/http";
import { verifyEmail } from "@/server/services/auth";

export const POST = route(async ({ req }) => {
  const { token } = await readJson(req, z.object({ token: z.string().min(10).max(100) }));
  await verifyEmail(token);
  return { ok: true };
});
