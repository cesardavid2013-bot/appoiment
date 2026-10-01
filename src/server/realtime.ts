import "server-only";
import { sqlClient } from "./db/client";
import { routeEvent, type Audience, type Raw, type RealtimeEvent } from "@/domain/realtime";
import { log } from "./logger";

export { audienceFor, type RealtimeEvent } from "@/domain/realtime";

/**
 * Realtime fan-out. Database triggers (migration 0006) publish tiny payloads —
 * ids only — on the `kept_events` channel when appointments, messages, read
 * receipts or notifications change. One LISTEN connection per process
 * receives them and forwards each to the connected viewers allowed to see it.
 *
 * Clients never get record contents from this channel: an event only tells
 * the page *that* something changed, and the page refetches through the
 * normal, permission-checked endpoints.
 */

export const REALTIME_CHANNEL = "kept_events";

type Subscriber = { audience: Audience; send: (e: RealtimeEvent) => void };

type Hub = { subs: Set<Subscriber>; listening: Promise<unknown> | null; perUser: Map<string, number> };
const g = globalThis as unknown as { __keptRealtime?: Hub };
const hub: Hub = (g.__keptRealtime ??= { subs: new Set(), listening: null, perUser: new Map() });

/** Per-user cap so one account can't hold open unbounded connections. */
export const MAX_STREAMS_PER_USER = 8;

function ensureListening() {
  // postgres-js keeps the LISTEN connection alive and re-subscribes after reconnects.
  hub.listening ??= sqlClient
    .listen(REALTIME_CHANNEL, (payload) => {
      let raw: Raw;
      try {
        raw = JSON.parse(payload) as Raw;
      } catch {
        return;
      }
      for (const s of hub.subs) {
        const e = routeEvent(raw, s.audience);
        if (e) s.send(e);
      }
    })
    .catch((err) => {
      hub.listening = null;
      log.error("realtime.listen_failed", { err });
    });
  return hub.listening;
}

/** Registers a connection; returns the unsubscribe function, or null when the user is at the cap. */
export function subscribe(audience: Audience, send: (e: RealtimeEvent) => void): (() => void) | null {
  const n = hub.perUser.get(audience.userId) ?? 0;
  if (n >= MAX_STREAMS_PER_USER) return null;
  hub.perUser.set(audience.userId, n + 1);
  const sub: Subscriber = { audience, send };
  hub.subs.add(sub);
  void ensureListening();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    hub.subs.delete(sub);
    const left = (hub.perUser.get(audience.userId) ?? 1) - 1;
    if (left <= 0) hub.perUser.delete(audience.userId);
    else hub.perUser.set(audience.userId, left);
  };
}
