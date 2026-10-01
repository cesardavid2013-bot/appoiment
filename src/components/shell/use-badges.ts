"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Unread counts, refreshed in the background (paused while the tab is hidden). */
export function useBadges(enabled: boolean) {
  return useQuery({
    queryKey: ["badges"],
    queryFn: () => api<{ notifications: number; messages: number }>("/api/me/badges"),
    enabled,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });
}
