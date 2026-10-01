import { readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { ipHash } from "@/server/request";
import { askAssistant, assistantSchema } from "@/server/services/assistant";

export const POST = route(async ({ req, viewer }) => {
  await rateLimit("assistant", viewer?.id ?? (await ipHash()));
  return askAssistant(await readJson(req, assistantSchema), viewer);
});
