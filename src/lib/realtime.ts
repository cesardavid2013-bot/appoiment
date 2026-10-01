"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

export type RealtimeKind = "appointment" | "message" | "read" | "notification";
export type RealtimeEvent = { kind: RealtimeKind; id: string; conversationId?: string };
type Listener = (e: RealtimeEvent) => void;

/**
 * One EventSource per tab, shared by every component that wants live updates.
 * It opens on the first subscriber and closes when the last one leaves; the
 * browser reconnects on its own after drops (the server sets `retry`).
 */
const listeners = new Set<Listener>();
const statusListeners = new Set<() => void>();
let source: EventSource | null = null;
let connected = false;

function setConnected(v: boolean) {
  if (connected === v) return;
  connected = v;
  statusListeners.forEach((l) => l());
}

function open() {
  if (source || typeof EventSource === "undefined") return;
  source = new EventSource("/api/events");
  source.onopen = () => setConnected(true);
  source.onerror = () => setConnected(false);
  for (const kind of ["appointment", "message", "read", "notification"] as const) {
    source.addEventListener(kind, (ev) => {
      let e: RealtimeEvent;
      try {
        e = JSON.parse((ev as MessageEvent<string>).data) as RealtimeEvent;
      } catch {
        return;
      }
      listeners.forEach((l) => l(e));
    });
  }
}

function close() {
  source?.close();
  source = null;
  setConnected(false);
}

/** Calls `handler` for live events of the given kinds while the component is mounted. */
export function useRealtime(kinds: readonly RealtimeKind[], handler: Listener, enabled = true) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  const key = kinds.join(",");
  useEffect(() => {
    if (!enabled) return;
    const wanted = new Set(key.split(","));
    const l: Listener = (e) => wanted.has(e.kind) && ref.current(e);
    listeners.add(l);
    open();
    return () => {
      listeners.delete(l);
      if (listeners.size === 0) close();
    };
  }, [key, enabled]);
}

/** Whether the live connection is up — lets pollers slow down while events flow. */
export function useRealtimeConnected() {
  return useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    () => connected,
    () => false,
  );
}
