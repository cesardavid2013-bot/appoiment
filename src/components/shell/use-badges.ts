"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRealtime, useRealtimeConnected } from "@/lib/realtime";

/** Unread counts: updated the moment a message or notification lands, with slow polling as a fallback. */
export function useBadges(enabled: boolean) {
  const qc = useQueryClient();
  const live = useRealtimeConnected();
  useRealtime(["message", "read", "notification"], () => qc.invalidateQueries({ queryKey: ["badges"] }), enabled);
  return useQuery({
    queryKey: ["badges"],
    queryFn: () => api<{ notifications: number; messages: number }>("/api/me/badges"),
    enabled,
    refetchInterval: live ? 120_000 : 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });
}
