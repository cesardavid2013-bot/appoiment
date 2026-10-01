import { readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { ipHash } from "@/server/request";
import { getQuote, quoteSchema } from "@/server/services/booking";

export const POST = route(async ({ req, viewer }) => {
  const input = await readJson(req, quoteSchema);
  // Codes are checked here before booking — limit how fast anyone can guess them.
  if (input.promoCode) await rateLimit("promo", viewer?.id ?? (await ipHash()));
  return getQuote(viewer, input);
});
