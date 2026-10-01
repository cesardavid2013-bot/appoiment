import { rateLimit } from "@/server/rate-limit";
import { readQuery, route } from "@/server/http";
import { ipHash } from "@/server/request";
import { searchBusinesses, searchSchema } from "@/server/services/search";

export const GET = route(async ({ req }) => {
  await rateLimit("search", await ipHash());
  return searchBusinesses(readQuery(req, searchSchema));
});
