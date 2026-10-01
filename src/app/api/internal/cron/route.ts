import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/server/crypto";
import { env } from "@/server/env";
import { runJobsOnce } from "@/server/worker";

/** For serverless deployments without a long-running worker: call every minute with the CRON_SECRET. */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!env.CRON_SECRET || !safeEqual(auth, `Bearer ${env.CRON_SECRET}`)) return NextResponse.json({ error: "not found" }, { status: 404 });
  let handled = 0;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const n = await runJobsOnce(20);
    handled += n;
    if (n === 0) break;
  }
  return NextResponse.json({ handled });
}
