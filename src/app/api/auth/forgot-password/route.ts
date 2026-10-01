import { z } from "zod";
import { readJson, route } from "@/server/http";
import { requestPasswordReset } from "@/server/services/auth";

export const POST = route(async ({ req }) => {
  const { email } = await readJson(req, z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address") }));
  await requestPasswordReset(email);
  return { ok: true };
});
