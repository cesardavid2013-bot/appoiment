import { z } from "zod";
import { rateLimit } from "@/server/rate-limit";
import { readQuery, route } from "@/server/http";
import { ipHash } from "@/server/request";
import { suggest } from "@/server/services/search";

export const GET = route(async ({ req }) => {
  await rateLimit("search", await ipHash());
  const { q } = readQuery(req, z.object({ q: z.string().max(100).default("") }));
  return suggest(q);
});
