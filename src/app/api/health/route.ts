import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { features } from "@/server/env";

export const dynamic = "force-dynamic";

/** For uptime monitors and load balancers: database reachable, and which optional services are switched on (no secrets). */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ ok: true, payments: features.stripe, email: features.email }, { headers: { "cache-control": "no-store" } });
}
