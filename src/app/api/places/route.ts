import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { env, features } from "@/server/env";
import { rateLimit } from "@/server/rate-limit";
import { readQuery, route } from "@/server/http";
import { ipHash } from "@/server/request";

type Place = { label: string; lat: number; lng: number };

/**
 * Location lookup for search. Uses a configured geocoder when available;
 * otherwise matches the cities where businesses on the platform operate.
 */
export const GET = route(async ({ req }) => {
  await rateLimit("geocode", await ipHash());
  const { q } = readQuery(req, z.object({ q: z.string().trim().min(2).max(100) }));
  const local = await db.execute<{ city: string; region: string | null; lat: number; lng: number }>(sql`
    select city, max(region) as region, avg(lat)::float as lat, avg(lng)::float as lng
    from locations where is_active and lat is not null and city ilike ${q.replace(/[%_]/g, "") + "%"}
    group by city order by count(*) desc limit 5`);
  const places: Place[] = [...local].map((r) => ({ label: r.region ? `${r.city}, ${r.region}` : r.city, lat: r.lat, lng: r.lng }));
  if (features.geocoding && places.length < 5) {
    try {
      const url = new URL(env.GEOCODER_URL!);
      url.searchParams.set("q", q);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "5");
      const res = await fetch(url, { headers: { "user-agent": "Kept/1.0" }, signal: AbortSignal.timeout(4000) });
      const json = (await res.json()) as { display_name: string; lat: string; lon: string }[];
      for (const r of json) places.push({ label: r.display_name.split(",").slice(0, 3).join(","), lat: Number(r.lat), lng: Number(r.lon) });
    } catch {
      /* geocoder optional */
    }
  }
  return places.slice(0, 6);
});
