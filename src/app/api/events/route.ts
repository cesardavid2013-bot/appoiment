import { getViewer } from "@/server/auth/session";
import { listMemberships } from "@/server/authz";
import { audienceFor, subscribe, type RealtimeEvent } from "@/server/realtime";

export const dynamic = "force-dynamic";

/** Streams are recycled so a revoked session or membership stops hearing events within minutes. */
const MAX_LIFETIME_MS = 10 * 60_000;
const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events: tells the signed-in viewer's open pages that something
 * they can see changed (an appointment, a message, a read receipt, a
 * notification). Payloads carry ids only; pages refetch through the regular
 * permission-checked endpoints.
 */
export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response(null, { status: 401 });
  const audience = audienceFor(viewer.id, await listMemberships(viewer.id));

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          close();
        }
      };
      const unsubscribe = subscribe(audience, (e: RealtimeEvent) => write(`event: ${e.kind}\ndata: ${JSON.stringify(e)}\n\n`));
      if (!unsubscribe) {
        // Too many open tabs for this account: ask the browser to back off.
        controller.enqueue(enc.encode("retry: 60000\n\n"));
        controller.close();
        return;
      }
      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      const lifetime = setTimeout(() => close(), MAX_LIFETIME_MS);
      function close() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        unsubscribe!();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
      cleanup = close;
      req.signal.addEventListener("abort", close);
      write("retry: 3000\n: connected\n\n");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
