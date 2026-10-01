import { destroyCurrentSession } from "@/server/auth/session";
import { route } from "@/server/http";

export const POST = route(async () => {
  await destroyCurrentSession();
  return { ok: true };
});
