import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { log } from "@/server/logger";
import { handleStripeEvent, stripe } from "@/server/services/payments";

export async function POST(req: NextRequest) {
  const s = stripe();
  if (!s || !env.STRIPE_WEBHOOK_SECRET) return NextResponse.json({ error: "not configured" }, { status: 404 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const body = await req.text();
  let event;
  try {
    event = await s.webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    log.warn("stripe.webhook_signature_invalid", { err });
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  try {
    const res = await handleStripeEvent(event);
    return NextResponse.json({ received: true, ...res });
  } catch (err) {
    log.error("stripe.webhook_failed", { id: event.id, type: event.type, err });
    // Non-2xx makes Stripe retry with backoff.
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
