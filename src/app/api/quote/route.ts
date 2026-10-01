import { readJson, route } from "@/server/http";
import { getQuote, quoteSchema } from "@/server/services/booking";

export const POST = route(async ({ req, viewer }) => getQuote(viewer, await readJson(req, quoteSchema)));
