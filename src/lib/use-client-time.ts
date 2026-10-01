"use client";

import { useSyncExternalStore } from "react";

/*
 * Hydration-safe access to the browser's clock and time zone. During
 * hydration React uses the server values, then switches to the client's —
 * so relative times ("5m ago") and day grouping never cause mismatches.
 */

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribeClock(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 60_000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Current time (ms), refreshed every minute on the client. */
export function useNow(serverNow: number): number {
  return useSyncExternalStore(subscribeClock, () => now, () => serverNow);
}

const noop = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The viewer's IANA zone in the browser; `fallback` on the server. */
export function useTimeZone(fallback: string): string {
  return useSyncExternalStore(noop, browserZone, () => fallback);
}
