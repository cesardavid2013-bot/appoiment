"use client";

import { useQuery } from "@tanstack/react-query";
import { Inbox, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Segmented } from "@/components/ui/controls";
import { Avatar, type MediaLike } from "@/components/ui/media";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ListTime } from "./list-time";

export type InboxRow = {
  id: string;
  lastMessageAt: string;
  preview: string | null;
  unread: boolean;
  lastSender: "customer" | "business" | "system" | null;
  customerName: string;
  customerUserId: string;
  clientId: string | null;
  avatar: MediaLike | null;
};

type Filter = "all" | "unread";

/** Business inbox list. Polls in the background and hides itself on phones while a thread is open. */
export function InboxList({ initial, fallbackZone, serverNow }: { initial: InboxRow[]; fallbackZone: string; serverNow: number }) {
  const pathname = usePathname() ?? "";
  const activeId = pathname.match(/^\/pro\/messages\/([0-9a-f-]{36})/i)?.[1] ?? null;
  const inThread = pathname !== "/pro/messages";
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const isDefault = term === "" && filter === "all";
  const { data, isFetching } = useQuery({
    queryKey: ["inbox", term, filter],
    queryFn: ({ signal }) => api<InboxRow[]>(`/api/pro/messages?${new URLSearchParams({ ...(term ? { q: term } : {}), filter })}`, { signal }),
    initialData: isDefault ? initial : undefined,
    initialDataUpdatedAt: isDefault ? serverNow : undefined,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });
  const rows = data ?? [];
  const unreadCount = isDefault ? rows.filter((r) => r.unread).length : filter === "unread" && !term ? rows.length : null;

  return (
    <section aria-label="Conversations" className={cn("flex min-h-0 flex-col border-line lg:h-dvh lg:border-e", inThread && "hidden lg:flex")}>
      <div className="shrink-0 px-4 pb-3 pt-8 sm:px-6 lg:px-4 lg:pt-7">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-display text-[32px] leading-none tracking-[-0.01em] text-ink lg:text-[28px]">Inbox</h1>
          <p className="text-[13px] text-ink-3 tabular" aria-live="polite">
            {unreadCount == null ? null : unreadCount ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <label htmlFor="inbox-search" className="sr-only">
            Search conversations by client name
          </label>
          <input
            id="inbox-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clients"
            className="h-11 w-full rounded-md border border-line-strong bg-surface ps-9 pe-9 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 md:h-10 md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} className="absolute end-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded text-ink-3 hover:text-ink" aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="mt-3">
          <Segmented
            label="Show"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "unread", label: "Unread" },
            ]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line" aria-busy={isFetching || undefined}>
        {rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Inbox className="mx-auto size-6 text-ink-3" aria-hidden />
            <p className="mt-3 text-[15px] font-semibold text-ink">{term ? `No clients named “${term}”` : filter === "unread" ? "Nothing unread" : "No messages yet"}</p>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-ink-3">
              {term || filter === "unread" ? "Try a different search or show all conversations." : "When clients ask a question from your page or about a booking, it shows up here."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((c) => {
              const active = c.id === activeId;
              return (
                <li key={c.id}>
                  <Link
                    href={`/pro/messages/${c.id}`}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex items-center gap-3 px-4 py-3.5 transition-colors sm:px-6 lg:px-4", active ? "bg-surface-3/60" : "hover:bg-surface-2")}
                  >
                    <Avatar name={c.customerName} media={c.avatar} size={42} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-[15px] text-ink", c.unread ? "font-semibold" : "font-medium")}>{c.customerName}</span>
                        <ListTime iso={c.lastMessageAt} fallbackZone={fallbackZone} serverNow={serverNow} className={cn("shrink-0 text-[12px] tabular", c.unread ? "font-semibold text-ink" : "text-ink-3")} />
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={cn("line-clamp-1 min-w-0 flex-1 text-[13px]", c.unread ? "text-ink" : "text-ink-3")}>
                          {c.lastSender === "business" && <span className="text-ink-3">You: </span>}
                          {c.preview}
                        </span>
                        {c.unread && (
                          <span className="size-2.5 shrink-0 rounded-full bg-accent">
                            <span className="sr-only">Unread</span>
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
