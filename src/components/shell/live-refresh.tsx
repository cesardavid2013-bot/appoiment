"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useRealtime, type RealtimeKind } from "@/lib/realtime";

/**
 * Re-renders the current server page when a live event of the given kinds
 * arrives (debounced, so a burst of changes costs one refresh).
 */
export function LiveRefresh({ kinds }: { kinds: RealtimeKind[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime(kinds, () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 400);
  });
  return null;
}
