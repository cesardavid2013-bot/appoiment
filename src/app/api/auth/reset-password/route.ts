import { z } from "zod";
import { readJson, route } from "@/server/http";
import { resetPassword } from "@/server/services/auth";

export const POST = route(async ({ req }) => {
  const { token, password } = await readJson(req, z.object({ token: z.string().min(10).max(100), password: z.string().min(1).max(200) }));
  await resetPassword(token, password);
  return { ok: true };
});
