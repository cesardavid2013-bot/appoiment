"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowDown, ArrowUp, CalendarDays, ImagePlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MediaImage, type MediaLike } from "@/components/ui/media";
import { Spinner } from "@/components/ui/spinner";
import { useLocale, useT } from "@/i18n/client";
import type { TFunction } from "@/i18n/translate";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtTime, localDateKey } from "@/lib/format";
import { uploadMedia } from "@/lib/upload";
import { useNow, useTimeZone } from "@/lib/use-client-time";
import { apptLine, dayLabel } from "./time";
import type { ThreadAppointment, ThreadMessage, ThreadPayload } from "./types";

const POLL_MS = 6_000;
const GROUP_GAP_MS = 5 * 60_000;
const MAX_LEN = 2000;

type Pending = {
  tempId: string;
  body: string;
  media: MediaLike | null;
  mediaId: string | null;
  appointment: ThreadAppointment | null;
  status: "sending" | "failed";
  error?: string;
  createdAt: string;
};

type Upload = { file: string; preview: string; progress: number; id: string | null; media: MediaLike | null };

export type ThreadViewProps = {
  side: "customer" | "business";
  viewerId: string;
  /** null while composing the first message of a new conversation. */
  conversationId: string | null;
  /** "/api/messages" (customer) or "/api/pro/messages" (business). */
  endpoint: string;
  /** Extra body fields for the first message of a new conversation, e.g. { businessId }. */
  startWith?: Record<string, string>;
  /** Where threads live, e.g. "/messages" or "/pro/messages". */
  threadHref: string;
  appointmentHref: string;
  initialMessages: ThreadMessage[];
  initialHasMore: boolean;
  initialOtherLastReadAt: string | null;
  uploadBusinessId?: string | null;
  fallbackZone: string;
  serverNow: number;
  attach?: ThreadAppointment | null;
  placeholder: string;
  empty?: ReactNode;
};

function mergeById(base: ThreadMessage[], incoming: ThreadMessage[]) {
  if (!incoming.length) return base;
  const map = new Map(base.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => (a.cursor < b.cursor ? -1 : a.cursor > b.cursor ? 1 : 0));
}

export function ThreadView(p: ThreadViewProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const t = useT("messages");
  const { intl } = useLocale();
  const tz = useTimeZone(p.fallbackZone);
  const now = useNow(p.serverNow);
  const [messages, setMessages] = useState(p.initialMessages);
  const [hasMore, setHasMore] = useState(p.initialHasMore);
  const [otherReadAt, setOtherReadAt] = useState(p.initialOtherLastReadAt);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [unseenBelow, setUnseenBelow] = useState(0);
  const [convId, setConvId] = useState(p.conversationId);
  const [loadError, setLoadError] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const prependFrom = useRef<number | null>(null);
  const stickToBottom = useRef(true);

  const refreshBadges = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["badges"] });
    qc.invalidateQueries({ queryKey: ["inbox"] });
  }, [qc]);

  // Opening the thread marked it read on the server; let the badges catch up.
  useEffect(() => {
    if (p.conversationId) refreshBadges();
  }, [p.conversationId, refreshBadges]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Keep the newest message in view as content arrives, unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prependFrom.current != null) {
      el.scrollTop += el.scrollHeight - prependFrom.current;
      prependFrom.current = null;
      return;
    }
    if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
      stickToBottom.current = false;
    }
  }, [messages, pending]);

  // Late layout changes (fonts, photos) shouldn't push the newest message out of view.
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = content.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const s = scroller.current;
      if (s && nearBottom.current && prependFrom.current == null) s.scrollTop = s.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom.current && unseenBelow) setUnseenBelow(0);
  }

  // Poll for new messages while the tab is visible.
  const lastCursor = messages.at(-1)?.cursor ?? null;
  const cursorRef = useRef(lastCursor);
  useEffect(() => {
    cursorRef.current = lastCursor;
  }, [lastCursor]);

  useEffect(() => {
    if (!convId) return;
    let stopped = false;
    let inFlight = false;
    async function poll() {
      if (inFlight || stopped || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const qs = cursorRef.current ? `?after=${encodeURIComponent(cursorRef.current)}` : "";
        const t = await api<ThreadPayload>(`${p.endpoint}/${convId}${qs}`);
        if (stopped) return;
        setOtherReadAt(t.otherLastReadAt);
        if (t.messages.length) {
          const fresh = t.messages.filter((m) => !m.mine);
          stickToBottom.current = nearBottom.current;
          if (!nearBottom.current && fresh.length) setUnseenBelow((n) => n + fresh.length);
          setMessages((prev) => mergeById(prev, t.messages));
        }
        if (t.markedRead) refreshBadges();
      } catch {
        /* transient — the next tick retries */
      } finally {
        inFlight = false;
      }
    }
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [convId, p.endpoint, refreshBadges]);

  async function loadOlder() {
    if (!convId || !messages.length) return;
    setLoadingOlder(true);
    try {
      const t = await api<ThreadPayload>(`${p.endpoint}/${convId}?before=${encodeURIComponent(messages[0].cursor)}`);
      prependFrom.current = scroller.current?.scrollHeight ?? null;
      setMessages((prev) => mergeById(prev, t.messages));
      setHasMore(t.hasMore);
    } catch (err) {
      prependFrom.current = null;
      setLoadError((err as ApiError).message);
    } finally {
      setLoadingOlder(false);
    }
  }

  async function deliver(item: Pending) {
    try {
      const body = { body: item.body, mediaId: item.mediaId, appointmentId: item.appointment?.id ?? null };
      const res = convId
        ? await api<{ conversationId: string; message: { id: string; createdAt: string; senderUserId: string | null } }>(`${p.endpoint}/${convId}`, { body })
        : await api<{ conversationId: string; message: { id: string; createdAt: string; senderUserId: string | null } }>(p.endpoint, { body: { ...body, ...p.startWith } });
      const sent: ThreadMessage = {
        id: res.message.id,
        body: item.body,
        senderRole: p.side,
        senderUserId: res.message.senderUserId,
        senderName: t("view.you"),
        mine: true,
        createdAt: res.message.createdAt,
        cursor: res.message.createdAt,
        media: item.media,
        appointment: item.appointment,
      };
      stickToBottom.current = true;
      setPending((prev) => prev.filter((x) => x.tempId !== item.tempId));
      setMessages((prev) => mergeById(prev, [sent]));
      qc.invalidateQueries({ queryKey: ["inbox"] });
      if (!convId) {
        setConvId(res.conversationId);
        router.replace(`${p.threadHref}/${res.conversationId}`);
        router.refresh();
      }
    } catch (err) {
      setPending((prev) => prev.map((x) => (x.tempId === item.tempId ? { ...x, status: "failed", error: (err as ApiError).message } : x)));
    }
  }

  function send(input: { body: string; upload: Upload | null; appointment: ThreadAppointment | null }) {
    const item: Pending = {
      tempId: `tmp-${Math.random().toString(36).slice(2)}`,
      body: input.body,
      media: input.upload?.media ?? null,
      mediaId: input.upload?.id ?? null,
      appointment: input.appointment,
      status: "sending",
      createdAt: new Date().toISOString(),
    };
    stickToBottom.current = true;
    setPending((prev) => [...prev, item]);
    void deliver(item);
  }

  function retry(item: Pending) {
    const again = { ...item, status: "sending" as const, error: undefined };
    setPending((prev) => prev.map((x) => (x.tempId === item.tempId ? again : x)));
    void deliver(again);
  }

  // Group into days, then runs of messages from the same sender a few minutes apart.
  const days = useMemo(() => {
    const out: { key: string; label: string; groups: { mine: boolean; system: boolean; senderUserId: string | null; senderName: string; items: ThreadMessage[] }[] }[] = [];
    for (const m of messages) {
      const key = localDateKey(m.createdAt, tz);
      let day = out.at(-1);
      if (!day || day.key !== key) {
        day = { key, label: dayLabel(m.createdAt, tz, now, intl), groups: [] };
        out.push(day);
      }
      const g = day.groups.at(-1);
      const last = g?.items.at(-1);
      const system = m.senderRole === "system";
      if (g && last && !system && !g.system && g.mine === m.mine && g.senderUserId === m.senderUserId && new Date(m.createdAt).getTime() - new Date(last.createdAt).getTime() < GROUP_GAP_MS) {
        g.items.push(m);
      } else {
        day.groups.push({ mine: m.mine, system, senderUserId: m.senderUserId, senderName: m.senderName, items: [m] });
      }
    }
    return out;
  }, [messages, tz, now, intl]);

  const lastMine = [...messages].reverse().find((m) => m.mine);
  const seen = Boolean(lastMine && otherReadAt && otherReadAt >= lastMine.createdAt && !pending.length && messages.at(-1)?.id === lastMine.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" role="log" aria-live="polite" aria-relevant="additions" aria-label={t("view.label")}>
        <div ref={content} className="mx-auto flex min-h-full max-w-3xl flex-col justify-end px-4 pb-4 pt-6 sm:px-6">
          {hasMore && (
            <div className="mb-4 flex justify-center">
              <button type="button" onClick={loadOlder} disabled={loadingOlder} className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-60">
                {loadingOlder ? <Spinner className="size-3.5" label={t("view.loadingEarlier")} /> : <ArrowUp className="size-3.5" aria-hidden />}
                {t("view.showEarlier")}
              </button>
            </div>
          )}
          {loadError && <p className="mb-3 text-center text-[13px] text-danger">{loadError}</p>}
          {messages.length === 0 && pending.length === 0 && p.empty}

          {days.map((day) => (
            <section key={day.key} aria-label={day.label}>
              <h3 className="sticky top-0 z-[1] my-3 flex justify-center">
                <span className="rounded-full bg-bg/90 px-2.5 py-0.5 text-[12px] font-medium text-ink-3 backdrop-blur-sm">{day.label}</span>
              </h3>
              {day.groups.map((g) =>
                g.system ? (
                  <div key={g.items[0].id} className="my-3 space-y-1.5">
                    {g.items.map((m) => (
                      <SystemLine key={m.id} m={m} tz={tz} intl={intl} appointmentHref={p.appointmentHref} />
                    ))}
                  </div>
                ) : (
                  <div key={g.items[0].id} className={cn("mt-3 flex flex-col gap-0.5", g.mine ? "items-end" : "items-start")}>
                    {p.side === "business" && g.mine && g.senderUserId && g.senderUserId !== p.viewerId && <p className="mb-0.5 px-1 text-[12px] text-ink-3">{g.senderName}</p>}
                    {g.items.map((m, i) => (
                      <Bubble key={m.id} m={m} mine={g.mine} first={i === 0} last={i === g.items.length - 1} appointmentHref={p.appointmentHref} t={t} intl={intl} />
                    ))}
                    <p className="mt-0.5 px-1 text-[11px] text-ink-3 tabular">
                      <time dateTime={g.items[g.items.length - 1].createdAt}>{fmtTime(g.items[g.items.length - 1].createdAt, tz, intl)}</time>
                      {seen && lastMine && g.items.includes(lastMine) && <span> · {t("view.seen")}</span>}
                    </p>
                  </div>
                ),
              )}
            </section>
          ))}

          {pending.map((x) => (
            <div key={x.tempId} className="mt-3 flex flex-col items-end gap-0.5">
              <Bubble
                m={{ id: x.tempId, body: x.body, senderRole: p.side, senderUserId: p.viewerId, senderName: t("view.you"), mine: true, createdAt: x.createdAt, cursor: x.createdAt, media: x.media, appointment: x.appointment }}
                mine
                first
                last
                dim={x.status === "sending"}
                failed={x.status === "failed"}
                appointmentHref={p.appointmentHref}
                t={t}
                intl={intl}
              />
              {x.status === "sending" ? (
                <p className="px-1 text-[11px] text-ink-3">{t("view.sending")}</p>
              ) : (
                <p className="flex flex-wrap items-center justify-end gap-x-2 px-1 text-[12px] text-danger" role="alert">
                  <AlertCircle className="size-3.5" aria-hidden />
                  <span>{x.error ?? t("view.notSent")}</span>
                  <button type="button" onClick={() => retry(x)} className="font-semibold underline underline-offset-2">
                    {t("view.retry")}
                  </button>
                  <button type="button" onClick={() => setPending((prev) => prev.filter((y) => y.tempId !== x.tempId))} className="text-ink-3 underline underline-offset-2">
                    {t("view.discard")}
                  </button>
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {unseenBelow > 0 && (
        <div className="pointer-events-none relative">
          <button
            type="button"
            onClick={() => {
              setUnseenBelow(0);
              scrollToBottom(true);
            }}
            className="pointer-events-auto absolute inset-x-0 -top-12 mx-auto inline-flex h-8 w-fit items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-md"
          >
            <ArrowDown className="size-3.5" aria-hidden />
            {t("view.newMessages", { count: unseenBelow })}
          </button>
        </div>
      )}

      <Composer key={p.attach?.id ?? "none"} t={t} intl={intl} placeholder={p.placeholder} uploadBusinessId={p.uploadBusinessId ?? null} attach={p.attach ?? null} onSend={send} />
    </div>
  );
}

function SystemLine({ m, tz, intl, appointmentHref }: { m: ThreadMessage; tz: string; intl: string; appointmentHref: string }) {
  const body = (
    <>
      <CalendarDays className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">
        {m.body}
        <span className="text-ink-3"> · {fmtTime(m.createdAt, tz, intl)}</span>
      </span>
    </>
  );
  const cls = "mx-auto flex w-fit max-w-[92%] items-start gap-1.5 rounded-md px-2.5 py-1 text-center text-[12px] leading-snug text-ink-2";
  return m.appointment ? (
    <Link href={`${appointmentHref}${m.appointment.id}`} className={cn(cls, "hover:bg-surface-2 hover:text-ink")}>
      {body}
    </Link>
  ) : (
    <p className={cls}>{body}</p>
  );
}

function Bubble({ m, mine, first, last, dim, failed, appointmentHref, t, intl }: { m: ThreadMessage; mine: boolean; first: boolean; last: boolean; dim?: boolean; failed?: boolean; appointmentHref: string; t: TFunction; intl: string }) {
  const radius = mine ? cn("rounded-2xl", !first && "rounded-se-md", !last && "rounded-ee-md") : cn("rounded-2xl", !first && "rounded-ss-md", !last && "rounded-es-md");
  return (
    <div className={cn("flex max-w-[82%] flex-col gap-1 sm:max-w-[70%]", mine ? "items-end" : "items-start", dim && "opacity-70")}>
      {m.media && (
        <a href={m.media.sources.at(-1)?.url} target="_blank" rel="noreferrer" className={cn("block w-56 overflow-hidden border border-line sm:w-64", radius)}
          style={{ aspectRatio: m.media.width && m.media.height ? Math.min(1.8, Math.max(0.6, m.media.width / m.media.height)) : 4 / 3 }}
          aria-label={t("view.openPhoto")}
        >
          <MediaImage media={m.media} alt={t("view.photo")} sizes="256px" className="size-full" fit="cover" />
        </a>
      )}
      {(m.body || m.appointment) && (
        <div className={cn("px-3.5 py-2 text-[15px] leading-[1.45]", radius, mine ? "bg-ink text-bg" : "border border-line bg-surface text-ink", failed && "ring-2 ring-danger/40")}>
          {m.appointment && (
            <Link
              href={`${appointmentHref}${m.appointment.id}`}
              className={cn("mb-1 flex items-center gap-1.5 text-[12px] font-medium underline-offset-2 hover:underline", mine ? "text-bg/75" : "text-ink-3", !m.body && "mb-0")}
            >
              <CalendarDays className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{apptLine(m.appointment, t, intl)}</span>
            </Link>
          )}
          {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
        </div>
      )}
    </div>
  );
}

function Composer({ t, intl, placeholder, uploadBusinessId, attach, onSend }: { t: TFunction; intl: string; placeholder: string; uploadBusinessId: string | null; attach: ThreadAppointment | null; onSend: (x: { body: string; upload: Upload | null; appointment: ThreadAppointment | null }) => void }) {
  const [body, setBody] = useState("");
  const [upload, setUpload] = useState<Upload | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<ThreadAppointment | null>(attach);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const inputId = useId();

  // Grow with the text up to ~6 lines.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [body]);

  const uploading = Boolean(upload && !upload.id);
  const canSend = !uploading && (body.trim().length > 0 || Boolean(upload?.id)) && body.length <= MAX_LEN;

  function submit() {
    if (!canSend) return;
    onSend({ body: body.trim(), upload, appointment });
    setBody("");
    setUpload(null);
    setAppointment(null);
    area.current?.focus();
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    if (fileInput.current) fileInput.current.value = "";
    setUploadError(null);
    const preview = URL.createObjectURL(file);
    setUpload({ file: file.name, preview, progress: 0, id: null, media: null });
    try {
      const res = await uploadMedia(file, { purpose: "message", businessId: uploadBusinessId, onProgress: (pct) => setUpload((u) => (u && u.preview === preview ? { ...u, progress: pct } : u)), alt: t("view.photo") });
      setUpload((u) => (u && u.preview === preview ? { ...u, id: res.id, media: res.media } : u));
    } catch (err) {
      setUpload(null);
      setUploadError((err as Error).message);
    }
  }

  return (
    <div className="shrink-0 border-t border-line bg-bg">
      <div className="mx-auto max-w-3xl px-3 py-2.5 sm:px-6 sm:py-3">
        {(appointment || upload || uploadError) && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {appointment && (
              <span className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-line bg-surface ps-2.5 pe-1 text-[13px] text-ink-2">
                <CalendarDays className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                <span className="truncate">{t("composer.about", { appointment: apptLine(appointment, t, intl) })}</span>
                <button type="button" onClick={() => setAppointment(null)} className="flex size-6 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={t("composer.unlink")}>
                  <X className="size-3.5" />
                </button>
              </span>
            )}
            {upload && (
              <span className="relative size-14 overflow-hidden rounded-lg border border-line bg-surface-2">
                {upload.media ? (
                  <MediaImage media={upload.media} alt={upload.file} sizes="56px" className="size-full" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={upload.preview} alt={upload.file} className="size-full object-cover opacity-60" />
                )}
                {!upload.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-bg/40 text-[11px] font-semibold text-ink tabular" aria-live="polite">
                    {upload.progress < 100 ? `${upload.progress}%` : <Spinner className="size-4" label={t("composer.processingPhoto")} />}
                  </span>
                )}
                <button type="button" onClick={() => setUpload(null)} className="absolute end-0.5 top-0.5 flex size-6 items-center justify-center rounded-full bg-surface/90 text-ink shadow-sm" aria-label={t("composer.removePhoto")}>
                  <X className="size-3.5" />
                </button>
              </span>
            )}
            {uploadError && (
              <span className="text-[13px] text-danger" role="alert">
                {uploadError}
              </span>
            )}
          </div>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={Boolean(upload)}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-40"
            aria-label={t("composer.attachPhoto")}
          >
            <ImagePlus className="size-5" />
          </button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files?.[0])} />
          <div className="min-w-0 flex-1">
            <label htmlFor={inputId} className="sr-only">
              {t("composer.label")}
            </label>
            <textarea
              id={inputId}
              aria-describedby={`${inputId}-hint`}
              ref={area}
              rows={1}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              enterKeyHint="send"
              placeholder={placeholder}
              maxLength={MAX_LEN + 200}
              className="block max-h-40 min-h-11 w-full resize-none rounded-[22px] border border-line-strong bg-surface px-4 py-2.5 text-[15px] leading-[1.45] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15"
            />
          </div>
          <button
            type="submit"
            disabled={!canSend}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-bg transition-opacity disabled:opacity-30"
            aria-label={t("composer.send")}
          >
            <ArrowUp className="size-5" strokeWidth={2.2} />
          </button>
        </form>
        {body.length > MAX_LEN - 200 && (
          <p className={cn("mt-1 px-14 text-end text-[12px] tabular", body.length > MAX_LEN ? "text-danger" : "text-ink-3")} aria-live="polite">
            {body.length.toLocaleString(intl)} / {MAX_LEN.toLocaleString(intl)}
          </p>
        )}
        <p id={`${inputId}-hint`} className="sr-only">{t("composer.hint")}</p>
      </div>
    </div>
  );
}

