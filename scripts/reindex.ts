// Rebuilds denormalized search fields for every business. Usage: npm run db:reindex
import "dotenv/config";
import { db, sqlClient } from "../src/server/db/client";
import { businesses } from "../src/server/db/schema";
import { refreshSearchIndex } from "../src/server/services/business";

async function main() {
  const rows = await db.select({ id: businesses.id }).from(businesses);
  for (const r of rows) await refreshSearchIndex(r.id);
  console.log(`Reindexed ${rows.length} businesses`);
  await sqlClient.end();
}
main();
