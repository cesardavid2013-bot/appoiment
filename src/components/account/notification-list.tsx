"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarDays, CheckCheck, Clock, CreditCard, LifeBuoy, MessageCircle, Star, Store } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { useLocale, useT } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { localDateKey, timeAgo } from "@/lib/format";
import { useNow, useTimeZone } from "@/lib/use-client-time";

export type NotificationItem = { id: string; type: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string };

const PAGE = 30;

function iconFor(type: string) {
  if (type.startsWith("message.")) return MessageCircle;
  if (type.startsWith("review.")) return Star;
  if (type.startsWith("support.")) return LifeBuoy;
  if (type.startsWith("waitlist.")) return Clock;
  if (type.startsWith("payment.")) return CreditCard;
  if (type.startsWith("business.")) return Store;
  if (type.startsWith("appointment.")) return CalendarDays;
  return Bell;
}

/** Only follow in-app paths; anything else is shown without a link. */
function safeHref(href: string | null) {
  return href && href.startsWith("/") && !href.startsWith("//") ? href : null;
}

export function NotificationList({ initial, serverNow, fallbackZone }: { initial: NotificationItem[]; serverNow: number; fallbackZone: string }) {
  const qc = useQueryClient();
  const t = useT("account");
  const { intl } = useLocale();
  const now = useNow(serverNow);
  const tz = useTimeZone(fallbackZone);
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length >= PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  // Items that were unread when shown keep their highlight for this visit, even once marked read.
  const [fresh, setFresh] = useState(() => new Set(initial.filter((n) => !n.readAt).map((n) => n.id)));
  // A live refresh brings a new `initial`: put notifications we haven't shown yet on top.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    const known = new Set(items.map((n) => n.id));
    const added = initial.filter((n) => !known.has(n.id));
    if (added.length) {
      setItems([...added, ...items]);
      setFresh(new Set([...fresh, ...added.filter((n) => !n.readAt).map((n) => n.id)]));
    }
  }
  const pending = useRef(new Set<string>());
  const sent = useRef(new Set<string>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const ids = [...pending.current].filter((id) => !sent.current.has(id)).slice(0, 100);
    pending.current.clear();
    if (!ids.length) return;
    ids.forEach((id) => sent.current.add(id));
    try {
      await api("/api/notifications", { body: { ids } });
      const at = new Date().toISOString();
      setItems((prev) => prev.map((n) => (ids.includes(n.id) && !n.readAt ? { ...n, readAt: at } : n)));
      qc.invalidateQueries({ queryKey: ["badges"] });
    } catch {
      ids.forEach((id) => sent.current.delete(id)); // retried next time they're seen
    }
  }, [qc]);

  // Mark notifications read as they scroll into view, batched.
  const observer = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.unreadId;
          if (e.isIntersecting && id) {
            pending.current.add(id);
            observer.current?.unobserve(e.target);
          }
        }
        if (flushTimer.current) clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(flush, 700);
      },
      { threshold: 0.6 },
    );
    document.querySelectorAll<HTMLElement>("[data-unread-id]").forEach((el) => observer.current!.observe(el));
    return () => {
      observer.current?.disconnect();
      if (flushTimer.current) clearTimeout(flushTimer.current);
    };
  }, [flush]);

  const observe = useCallback((el: HTMLElement | null) => {
    if (el && observer.current) observer.current.observe(el);
  }, []);

  async function markAll() {
    setMarkingAll(true);
    try {
      await api("/api/notifications", { body: {} });
      const at = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: at })));
      qc.invalidateQueries({ queryKey: ["badges"] });
      toast.success(t("notificationList.allCaughtUpToast"));
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setMarkingAll(false);
    }
  }

  async function loadOlder() {
    const last = items.at(-1);
    if (!last) return;
    setLoadingMore(true);
    try {
      const older = await api<NotificationItem[]>(`/api/notifications?before=${encodeURIComponent(last.createdAt)}`);
      setFresh((prev) => new Set([...prev, ...older.filter((n) => !n.readAt).map((n) => n.id)]));
      setItems((prev) => [...prev, ...older.filter((n) => !prev.some((p) => p.id === n.id))]);
      setHasMore(older.length >= PAGE);
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setLoadingMore(false);
    }
  }

  const unread = items.filter((n) => !n.readAt).length;
  const today = localDateKey(new Date(now), tz);
  const groups = [
    { key: "today", label: t("notificationList.today"), items: items.filter((n) => localDateKey(n.createdAt, tz) === today) },
    { key: "earlier", label: t("notificationList.earlier"), items: items.filter((n) => localDateKey(n.createdAt, tz) !== today) },
  ].filter((g) => g.items.length);

  if (!items.length) {
    return (
      <EmptyState
        className="mt-6 rounded-xl border border-dashed border-line-strong"
        icon={<Bell />}
        title={t("notificationList.emptyTitle")}
        description={t("notificationList.emptyBody")}
      />
    );
  }

  return (
    <div className="mt-6">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line pb-3">
        <p className="text-sm text-ink-3" aria-live="polite">
          {unread ? t("notificationList.unread", { count: unread }) : t("notificationList.caughtUp")}
        </p>
        <Button variant="ghost" size="sm" className="h-10 sm:h-8" onClick={markAll} loading={markingAll} disabled={!unread} icon={<CheckCheck className="size-4" />}>
          {t("notificationList.markAll")}
        </Button>
      </div>

      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`n-${g.key}`} className="mt-6 first-of-type:mt-4">
          <h2 id={`n-${g.key}`} className="mb-1 text-[13px] font-medium text-ink-3">
            {g.label}
          </h2>
          <ul className="divide-y divide-line">
            {g.items.map((n) => {
              const Icon = iconFor(n.type);
              const isUnread = !n.readAt;
              const highlight = isUnread || fresh.has(n.id);
              const href = safeHref(n.href);
              const inner = (
                <>
                  <span className={cn("relative mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full", highlight ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-ink-3")}>
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3">
                      <span className={cn("text-[15px] leading-snug text-ink", highlight ? "font-semibold" : "font-medium")}>{n.title}</span>
                      <time dateTime={n.createdAt} className="shrink-0 pt-0.5 text-[12px] text-ink-3 tabular" suppressHydrationWarning>
                        {timeAgo(n.createdAt, now, intl)}
                      </time>
                    </span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-sm leading-relaxed text-ink-3">{n.body}</span>}
                  </span>
                  {isUnread && (
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-hidden />
                  )}
                  {isUnread && <span className="sr-only">{t("notificationList.unreadItem")}</span>}
                </>
              );
              const cls = cn("-mx-3 flex items-start gap-3.5 rounded-lg px-3 py-3.5", href && "transition-colors hover:bg-surface");
              return (
                <li key={n.id} ref={isUnread ? observe : undefined} data-unread-id={isUnread ? n.id : undefined}>
                  {href ? (
                    <Link
                      href={href}
                      className={cls}
                      onClick={() => {
                        if (isUnread) {
                          pending.current.add(n.id);
                          void flush();
                        }
                      }}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className={cls}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="mt-6 flex justify-center">
        {hasMore ? (
          <Button variant="secondary" onClick={loadOlder} loading={loadingMore}>
            {t("notificationList.loadOlder")}
          </Button>
        ) : (
          items.length >= PAGE && <p className="text-sm text-ink-3">{t("notificationList.end")}</p>
        )}
      </div>
    </div>
  );
}
