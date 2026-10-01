/** Dev only: books a realistic week for North Fade Studio through the real booking engine. */
import "dotenv/config";
import { DateTime } from "luxon";
import { and, eq } from "drizzle-orm";
import { db, sqlClient } from "../src/server/db/client";
import { businesses, services, users } from "../src/server/db/schema";
import { createBooking } from "../src/server/services/booking";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("dev only");
  const [biz] = await db.select().from(businesses).where(eq(businesses.slug, "north-fade-studio"));
  const svcs = await db.select().from(services).where(and(eq(services.businessId, biz.id), eq(services.status, "active")));
  const customers = await db.select().from(users).where(eq(users.platformRole, "user"));
  const pool = customers.filter((u) => u.email?.startsWith("customer"));
  let made = 0;
  for (let day = 0; day < 6; day++) {
    for (const hour of [10, 11, 13, 14, 15, 16, 17]) {
      if (Math.random() < 0.45) continue;
      const svc = svcs[Math.floor(Math.random() * svcs.length)];
      const customer = pool[Math.floor(Math.random() * pool.length)];
      const start = DateTime.now().setZone(biz.timezone).plus({ days: day }).set({ hour, minute: Math.random() < 0.5 ? 0 : 30, second: 0, millisecond: 0 });
      if (start.toMillis() < Date.now() + 3600_000) continue;
      try {
        await createBooking(
          { id: customer.id, name: customer.name, email: customer.email, emailVerified: true, platformRole: "user", avatarMediaId: null, timezone: null, sessionId: "script" },
          { serviceId: svc.id, memberId: "any", locationId: null, start: start.toUTC().toISO()!, optionIds: [], intake: {}, idempotencyKey: `demo-${start.toMillis()}-${svc.id}`, source: "marketplace", customerNote: Math.random() < 0.2 ? "Same as last time, please." : null, serviceAddress: null },
        );
        made++;
      } catch {
        /* slot taken or outside hours — fine */
      }
    }
  }
  console.log(`booked ${made} demo appointments`);
  await sqlClient.end();
}
main();
