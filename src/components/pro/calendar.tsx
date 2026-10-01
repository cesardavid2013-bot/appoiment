"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarPlus, ChevronLeft, ChevronRight, ExternalLink, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/misc";
import { STATUS_TONE, type AppointmentStatus } from "@/domain/appointment-state";
import { formatDuration, formatMoney } from "@/domain/money";
import { addDaysIso, instantToLocal, isoWeekday, localMinuteToInstant, todayIn } from "@/domain/time";
import { useLocale, useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";
import type { TFunction } from "@/i18n/translate";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtTime } from "@/lib/format";
import { useRealtime, useRealtimeConnected } from "@/lib/realtime";
import { AppointmentControls } from "./appointment-controls";
import { BlockTimeDialog, NewAppointmentDialog } from "./pro-dialogs";

type View = "day" | "week" | "month" | "agenda";
type Appt = {
  id: string;
  reference: string;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  blockStartsAt: string;
  blockEndsAt: string;
  memberId: string | null;
  serviceName: string;
  options: { name: string }[] | null;
  customerName: string;
  customerId: string;
  isNewCustomer: boolean;
  totalCents: number;
  amountPaidCents: number;
  currency: string;
  source: string;
  hasNote: boolean;
  version: number;
};
type Block = { id: string; memberId: string | null; startsAt: string; endsAt: string; reason: string; note: string | null };
type Member = { id: string; name: string; color: string | null };
type CalData = { appointments: Appt[]; blocks: Block[]; team: Member[] };

const HOUR = 60;
const PX_PER_MIN = 1.1;
const MEMBER_TONES = ["#2e5e4e", "#2f5d8a", "#8a4b2f", "#6b4f8a", "#7a6a2b", "#2f7a7a", "#8a2f55"];

function rangeFor(view: View, date: string): { from: string; to: string } {
  if (view === "day") return { from: date, to: addDaysIso(date, 1) };
  if (view === "week") {
    const start = addDaysIso(date, -(isoWeekday(date) - 1));
    return { from: start, to: addDaysIso(start, 7) };
  }
  if (view === "agenda") return { from: date, to: addDaysIso(date, 14) };
  const first = `${date.slice(0, 7)}-01`;
  const gridStart = addDaysIso(first, -(isoWeekday(first) - 1));
  return { from: gridStart, to: addDaysIso(gridStart, 42) };
}

function shift(view: View, date: string, dir: 1 | -1) {
  if (view === "day") return addDaysIso(date, dir);
  if (view === "week") return addDaysIso(date, 7 * dir);
  if (view === "agenda") return addDaysIso(date, 14 * dir);
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + dir, 1);
  return d.toISOString().slice(0, 10);
}

/** A calendar date ("2026-10-01") formatted in the viewer's language. */
function fmtIsoDay(iso: string, o: Intl.DateTimeFormatOptions, intl: string) {
  return new Intl.DateTimeFormat(intl, { ...o, timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
}

function title(view: View, date: string, intl: string) {
  const r = rangeFor(view, date);
  if (view === "day") return fmtIsoDay(date, { weekday: "long", month: "long", day: "numeric" }, intl);
  if (view === "month") return fmtIsoDay(date, { month: "long", year: "numeric" }, intl);
  const last = addDaysIso(r.to, -1);
  const fmt = new Intl.DateTimeFormat(intl, { month: r.from.slice(0, 7) === last.slice(0, 7) ? "long" : "short", day: "numeric", timeZone: "UTC" });
  return fmt.formatRange(new Date(`${r.from}T12:00:00Z`), new Date(`${last}T12:00:00Z`));
}

/** Label for a time block's reason, falling back to the stored value. */
function reasonLabel(t: TFunction, reason: string) {
  const key = `blockReasons.${reason}`;
  const v = t(key);
  return v.endsWith(key) ? reason : v;
}

const TONE_STYLE: Record<string, string> = {
  positive: "border-s-accent",
  attention: "border-s-warn bg-warn-soft/60",
  info: "border-s-info",
  negative: "border-s-danger opacity-70",
  neutral: "border-s-line-strong opacity-75",
};

export function ProCalendar({
  initial,
  initialDate,
  initialView,
  timezone,
  currency,
  selfMemberId,
  canAll,
  canManage,
  canBlock,
  services,
}: {
  initial: CalData;
  initialDate: string;
  initialView: View;
  timezone: string;
  currency: string;
  selfMemberId: string;
  canAll: boolean;
  canManage: boolean;
  canBlock: boolean;
  services: { id: string; name: string; durationMinutes: number }[];
}) {
  const [view, setView] = useState<View>(initialView);
  const [date, setDate] = useState(initialDate);
  const [memberFilter, setMemberFilter] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Appt | null>(null);
  const [newAt, setNewAt] = useState<{ start: string; memberId: string } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const qc = useQueryClient();
  const t = useT("pro");
  const tRoot = useT();
  const { intl } = useLocale();
  const range = rangeFor(view, date);
  const today = todayIn(timezone);

  const fetchRange = (from: string, to: string) => {
    const p = new URLSearchParams({ from: new Date(localMinuteToInstant(from, 0, timezone)!).toISOString(), to: new Date(localMinuteToInstant(to, 0, timezone)!).toISOString() });
    return api<CalData>(`/api/pro/calendar?${p}`);
  };
  const live = useRealtimeConnected();
  const q = useQuery({
    queryKey: ["calendar", range.from, range.to],
    queryFn: () => fetchRange(range.from, range.to),
    initialData: range.from === rangeFor(initialView, initialDate).from && view === initialView ? initial : undefined,
    placeholderData: keepPreviousData,
    refetchInterval: live ? 300_000 : 60_000,
  });
  // Bookings, cancellations and moves made anywhere show up immediately.
  useRealtime(["appointment"], () => qc.invalidateQueries({ queryKey: ["calendar"] }));
  // Prefetch the neighbouring range so paging feels instant.
  useEffect(() => {
    const next = rangeFor(view, shift(view, date, 1));
    qc.prefetchQuery({ queryKey: ["calendar", next.from, next.to], queryFn: () => fetchRange(next.from, next.to), staleTime: 30_000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date]);

  // Keyboard: ← → to page, T for today.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || document.querySelector("[role=dialog]")) return;
      if (e.key === "ArrowRight") setDate((d) => shift(view, d, 1));
      if (e.key === "ArrowLeft") setDate((d) => shift(view, d, -1));
      if (e.key.toLowerCase() === "t") setDate(today);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, today]);

  const data = q.data ?? initial;
  const team = data.team;
  const tones = useMemo(() => new Map(team.map((m, i) => [m.id, m.color ?? MEMBER_TONES[i % MEMBER_TONES.length]])), [team]);
  const visibleTeam = memberFilter ? team.filter((m) => memberFilter.includes(m.id)) : team;
  const appts = data.appointments.filter((a) => a.status !== "pending_payment" && (!memberFilter || (a.memberId && memberFilter.includes(a.memberId))));
  const blocks = data.blocks.filter((b) => !memberFilter || !b.memberId || memberFilter.includes(b.memberId));

  const openNew = (start?: string, memberId?: string) => {
    setNewAt(start ? { start, memberId: memberId ?? selfMemberId } : null);
    setNewOpen(true);
  };

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col lg:min-h-dvh">
      {/* Toolbar */}
      <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 border-b border-line bg-bg/92 px-4 py-3 backdrop-blur-md sm:px-6 lg:top-0 lg:px-8">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setDate(shift(view, date, -1))} className="flex size-9 items-center justify-center rounded-md border border-line text-ink-2 hover:bg-surface-2" aria-label={t("calendar.previous")}>
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => setDate(shift(view, date, 1))} className="flex size-9 items-center justify-center rounded-md border border-line text-ink-2 hover:bg-surface-2" aria-label={t("calendar.next")}>
            <ChevronRight className="size-4" />
          </button>
          <Button variant="secondary" size="sm" className="ms-1 h-9" onClick={() => setDate(today)} disabled={date === today && view !== "month"}>
            {t("nav.today")}
          </Button>
        </div>
        <h1 className="me-auto min-w-0 truncate ps-1 text-[17px] font-semibold tracking-[-0.01em] text-ink" aria-live="polite">
          {title(view, date, intl)}
          {q.isFetching && <span className="ms-2 inline-block size-1.5 animate-pulse rounded-full bg-ink-3 align-middle" aria-label={t("calendar.updating")} />}
        </h1>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Segmented
            label={t("calendar.view")}
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "day", label: t("calendar.views.day") },
              { value: "week", label: t("calendar.views.week") },
              { value: "month", label: t("calendar.views.month") },
              { value: "agenda", label: t("calendar.views.agenda") },
            ]}
          />
          <div className="ms-auto flex gap-2 sm:ms-2">
            {canBlock && (
              <Button variant="secondary" size="sm" className="h-9" onClick={() => setBlockOpen(true)} icon={<Ban className="size-4" />}>
                <span className="hidden sm:inline">{t("calendar.block")}</span>
              </Button>
            )}
            {canManage && services.length > 0 && (
              <Button size="sm" className="h-9" onClick={() => openNew()} icon={<CalendarPlus className="size-4" />}>
                <span className="hidden sm:inline">{t("calendar.new")}</span>
              </Button>
            )}
          </div>
        </div>
        {canAll && team.length > 1 && (
          <div className="relative -mx-1 flex w-full gap-1.5 overflow-x-auto px-1 pt-1 scrollbar-none" role="group" aria-label={t("calendar.showTeam")}>
            {team.map((m) => {
              const on = !memberFilter || memberFilter.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const cur = memberFilter ?? team.map((tm) => tm.id);
                    const next = on ? cur.filter((x) => x !== m.id) : [...cur, m.id];
                    setMemberFilter(next.length === team.length || next.length === 0 ? null : next);
                  }}
                  className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[13px]", on ? "border-line-strong bg-surface text-ink" : "border-line text-ink-3 line-through")}
                >
                  <span className="size-2 rounded-full" style={{ background: tones.get(m.id) }} aria-hidden />
                  {m.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1">
        {view === "day" && <TimeGrid t={t} tRoot={tRoot} intl={intl} days={[date]} columns={canAll && visibleTeam.length > 1 ? visibleTeam : null} appts={appts} blocks={blocks} tz={timezone} tones={tones} onPick={setSelected} onEmpty={canManage ? openNew : undefined} today={today} />}
        {view === "week" && <TimeGrid t={t} tRoot={tRoot} intl={intl} days={Array.from({ length: 7 }, (_, i) => addDaysIso(range.from, i))} columns={null} appts={appts} blocks={blocks.filter((b) => !b.memberId || visibleTeam.length <= 1 || b.memberId === selfMemberId)} tz={timezone} tones={tones} onPick={setSelected} onEmpty={canManage ? openNew : undefined} today={today} onDay={(d) => { setDate(d); setView("day"); }} />}
        {view === "month" && <MonthGrid t={t} intl={intl} from={range.from} month={date.slice(0, 7)} appts={appts} tz={timezone} today={today} onDay={(d) => { setDate(d); setView("day"); }} />}
        {view === "agenda" && <Agenda t={t} tRoot={tRoot} intl={intl} from={range.from} appts={appts} tz={timezone} tones={tones} onPick={setSelected} currency={currency} today={today} showMember={canAll && team.length > 1} team={team} />}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)} title={selected?.customerName ?? ""} description={selected ? `${selected.serviceName}${selected.options?.length ? ` · ${selected.options.map((o) => o.name).join(", ")}` : ""}` : undefined} size="sm">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
              <div>
                <p className="text-[15px] font-semibold text-ink tabular">
                  {fmtTime(selected.startsAt, timezone, intl)} – {fmtTime(selected.endsAt, timezone, intl)}
                </p>
                <p className="text-[13px] text-ink-3">
                  {new Intl.DateTimeFormat(intl, { weekday: "long", month: "short", day: "numeric", timeZone: timezone }).format(new Date(selected.startsAt))} · {formatDuration(Math.round((new Date(selected.endsAt).getTime() - new Date(selected.startsAt).getTime()) / 60000), intl)}
                </p>
              </div>
              <Badge tone={STATUS_TONE[selected.status]}>{tRoot(`common.appointmentStatus.${selected.status}`)}</Badge>
            </div>
            <dl className="space-y-2 text-sm">
              {canAll && team.length > 1 && selected.memberId && (
                <div className="flex justify-between">
                  <dt className="text-ink-3">{t("calendar.with")}</dt>
                  <dd className="text-ink">{team.find((tm) => tm.id === selected.memberId)?.name}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-3">{t("calendar.price")}</dt>
                <dd className="text-ink tabular">
                  {formatMoney(selected.totalCents, selected.currency, { intl })}
                  {selected.amountPaidCents > 0 && <span className="text-ink-3"> · {t("calendar.paid", { amount: formatMoney(selected.amountPaidCents, selected.currency, { intl }) })}</span>}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">{t("calendar.booked")}</dt>
                <dd className="text-ink">{selected.source === "manual" ? t("calendar.source.manual") : selected.source === "walk_in" ? t("calendar.source.walkIn") : t("calendar.source.online")}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <ButtonLink href={`/pro/appointments/${selected.id}`} variant="secondary" size="sm" icon={<ExternalLink className="size-4" />}>
                {t("calendar.open")}
              </ButtonLink>
              {canManage && <AppointmentControls a={selected} onChanged={() => { setSelected(null); q.refetch(); }} />}
            </div>
          </div>
        )}
      </Dialog>

      {newOpen && (
        <NewAppointmentDialog
          open={newOpen}
          onOpenChange={(o) => {
            setNewOpen(o);
            if (!o) q.refetch();
          }}
          services={services}
          team={team.map((tm) => ({ id: tm.id, name: tm.name }))}
          timezone={timezone}
          canAssignOthers={canAll}
          selfMemberId={selfMemberId}
          initial={newAt ? { start: newAt.start, memberId: newAt.memberId } : undefined}
        />
      )}
      {blockOpen && <BlockTimeDialog open={blockOpen} onOpenChange={(o) => { setBlockOpen(o); if (!o) q.refetch(); }} team={team.map((tm) => ({ id: tm.id, name: tm.name }))} timezone={timezone} canAll={canAll} selfMemberId={selfMemberId} />}
    </div>
  );
}

/* ─────────────────────────── Time grid ─────────────────────────── */

function TimeGrid({
  t,
  tRoot,
  intl,
  days,
  columns,
  appts,
  blocks,
  tz,
  tones,
  onPick,
  onEmpty,
  today,
  onDay,
}: {
  t: TFunction;
  tRoot: TFunction;
  intl: string;
  days: string[];
  columns: Member[] | null;
  appts: Appt[];
  blocks: Block[];
  tz: string;
  tones: Map<string, string>;
  onPick: (a: Appt) => void;
  onEmpty?: (start: string, memberId?: string) => void;
  today: string;
  onDay?: (d: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // Visible hours adapt to the data: 7am–9pm by default, widened to fit anything booked.
  const minutesOf = (iso: string) => instantToLocal(new Date(iso).getTime(), tz).minute;
  let startH = 7;
  let endH = 21;
  for (const a of appts) {
    startH = Math.min(startH, Math.floor(minutesOf(a.startsAt) / 60));
    endH = Math.max(endH, Math.ceil((minutesOf(a.endsAt) || 1440) / 60));
  }
  const gridStart = startH * HOUR;
  const height = (endH - startH) * HOUR * PX_PER_MIN;
  const [nowMin, setNowMin] = useState(() => instantToLocal(Date.now(), tz).minute);
  useEffect(() => {
    const timer = setInterval(() => setNowMin(instantToLocal(Date.now(), tz).minute), 60_000);
    return () => clearInterval(timer);
  }, [tz]);
  // Scroll to what matters: "now" if it's inside the day, otherwise the first appointment, otherwise the morning.
  useEffect(() => {
    const firstAppt = appts.length ? Math.min(...appts.map((a) => minutesOf(a.startsAt))) : null;
    const nowVisible = days.includes(today) && nowMin > gridStart + 60 && nowMin < endH * 60 - 60;
    const focus = nowVisible ? nowMin - 60 : firstAppt != null ? firstAppt - 30 : 8 * 60;
    scroller.current?.scrollTo({ top: Math.max(0, (focus - gridStart) * PX_PER_MIN) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join()]);

  const cols: { key: string; date: string; memberId?: string; label: string; sub?: string }[] = columns
    ? columns.map((m) => ({ key: m.id, date: days[0], memberId: m.id, label: m.name }))
    : days.map((d) => ({
        key: d,
        date: d,
        label: fmtIsoDay(d, { weekday: "short" }, intl),
        sub: fmtIsoDay(d, { day: "numeric" }, intl),
      }));

  return (
    <div className="relative">
      <div ref={scroller} tabIndex={0} role="region" aria-label={t("calendar.schedule")} className="relative max-h-[calc(100dvh-190px)] overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent">
      <div className="sticky top-0 z-20 grid border-b border-line bg-bg" style={{ gridTemplateColumns: `56px repeat(${cols.length}, minmax(${cols.length > 3 ? 92 : 140}px, 1fr))` }}>
        <div />
        {cols.map((c) => (
          <button
            key={c.key}
            type="button"
            disabled={!onDay}
            onClick={() => onDay?.(c.date)}
            className={cn("flex items-center justify-center gap-1.5 border-s border-line py-2.5 text-[13px]", c.date === today && !columns ? "text-ink" : "text-ink-2", onDay && "hover:bg-surface-2")}
          >
            <span className="truncate font-medium">{c.label}</span>
            {c.sub && <span className={cn("flex size-6 items-center justify-center rounded-full text-[13px] font-semibold tabular", c.date === today ? "bg-ink text-bg" : "")}>{c.sub}</span>}
          </button>
        ))}
      </div>
        <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${cols.length}, minmax(${cols.length > 3 ? 92 : 140}px, 1fr))`, height }}>
          <div className="relative">
            {Array.from({ length: endH - startH }, (_, i) => (
              <span key={i} className="absolute end-2 -translate-y-1/2 text-[11px] text-ink-3 tabular" style={{ top: i * HOUR * PX_PER_MIN }}>
                {i === 0 ? "" : new Intl.DateTimeFormat(intl, { hour: "numeric" }).format(new Date(2026, 0, 1, startH + i))}
              </span>
            ))}
          </div>
          {cols.map((c) => {
            const colAppts = appts.filter((a) => localDayOf(a.startsAt, tz) === c.date && (!c.memberId || a.memberId === c.memberId));
            const colBlocks = blocks.filter((b) => overlapsDay(b, c.date, tz) && (!c.memberId || !b.memberId || b.memberId === c.memberId));
            const lanes = layoutLanes(colAppts);
            return (
              <div
                key={c.key}
                className="relative border-s border-line"
                onClick={(e) => {
                  if (!onEmpty || e.target !== e.currentTarget) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const minute = gridStart + Math.floor((e.clientY - rect.top) / PX_PER_MIN / 15) * 15;
                  const ms = localMinuteToInstant(c.date, minute, tz);
                  if (ms != null) onEmpty(new Date(ms).toISOString(), c.memberId);
                }}
              >
                {Array.from({ length: (endH - startH) * 2 }, (_, i) => (
                  <div key={i} className={cn("pointer-events-none absolute inset-x-0 border-t", i % 2 === 0 ? "border-line" : "border-line/50 border-dashed")} style={{ top: i * 30 * PX_PER_MIN }} />
                ))}
                {colBlocks.map((b) => {
                  const s = Math.max(gridStart, b.startsAt.slice(0, 10) && localDayOf(b.startsAt, tz) === c.date ? minutesOf(b.startsAt) : 0);
                  const e = localDayOf(b.endsAt, tz) === c.date ? minutesOf(b.endsAt) : endH * 60;
                  if (e <= s) return null;
                  return (
                    <div
                      key={b.id}
                      className="pointer-events-none absolute inset-x-0.5 rounded-sm bg-surface-2 px-1.5 py-1 text-[11px] text-ink-3"
                      style={{ top: (s - gridStart) * PX_PER_MIN, height: (e - s) * PX_PER_MIN, backgroundImage: "repeating-linear-gradient(135deg, transparent 0 6px, rgb(0 0 0 / 0.035) 6px 12px)" }}
                    >
                      <span className="font-medium">{reasonLabel(t, b.reason)}</span>
                      {b.note ? ` · ${b.note}` : ""}
                    </div>
                  );
                })}
                {colAppts.map((a) => {
                  const s = minutesOf(a.startsAt);
                  const e = minutesOf(a.endsAt) || 1440;
                  const lane = lanes.get(a.id)!;
                  const tone = STATUS_TONE[a.status];
                  const h = Math.max(22, (e - s) * PX_PER_MIN - 2);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onPick(a)}
                      className={cn("absolute overflow-hidden rounded-[5px] border border-s-[3px] border-line bg-surface px-1.5 py-1 text-start shadow-sm transition-shadow hover:z-10 hover:shadow-md focus-visible:z-10", TONE_STYLE[tone])}
                      style={{
                        top: (s - gridStart) * PX_PER_MIN + 1,
                        height: h,
                        left: `calc(${(lane.index / lane.count) * 100}% + 2px)`,
                        width: `calc(${100 / lane.count}% - 4px)`,
                        borderLeftColor: !columns && a.memberId && tones.size > 1 ? tones.get(a.memberId) : undefined,
                      }}
                      aria-label={`${a.customerName}, ${a.serviceName}, ${fmtTime(a.startsAt, tz, intl)}, ${tRoot(`common.appointmentStatus.${a.status}`)}`}
                    >
                      <span className="flex items-center gap-1 text-[12px] font-semibold leading-tight text-ink">
                        <span className="truncate">{a.customerName}</span>
                        {a.isNewCustomer && <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />}
                        {a.hasNote && <MessageSquareText className="size-3 shrink-0 text-ink-3" />}
                      </span>
                      {h > 34 && <span className="block truncate text-[11px] leading-tight text-ink-3">{a.serviceName}</span>}
                      {h > 50 && (
                        <span className="block text-[11px] leading-tight text-ink-3 tabular">
                          {fmtTime(a.startsAt, tz, intl)} – {fmtTime(a.endsAt, tz, intl)}
                        </span>
                      )}
                    </button>
                  );
                })}
                {c.date === today && nowMin >= gridStart && nowMin <= endH * 60 && (
                  <div className="pointer-events-none absolute inset-x-0 z-[5] flex items-center" style={{ top: (nowMin - gridStart) * PX_PER_MIN }} aria-hidden>
                    <span className="-ms-1 size-2 rounded-full bg-danger" />
                    <span className="h-px flex-1 bg-danger" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function localDayOf(iso: string, tz: string) {
  return instantToLocal(new Date(iso).getTime(), tz).date;
}
function overlapsDay(b: Block, date: string, tz: string) {
  const s = localDayOf(b.startsAt, tz);
  const e = localDayOf(new Date(new Date(b.endsAt).getTime() - 1).toISOString(), tz);
  return s <= date && e >= date;
}

/** Side-by-side lanes for overlapping items (e.g. group sessions, double-staffed views). */
function layoutLanes(items: Appt[]) {
  const sorted = [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const out = new Map<string, { index: number; count: number }>();
  let cluster: Appt[] = [];
  let clusterEnd = 0;
  const flush = () => {
    const laneEnds: number[] = [];
    const idx = new Map<string, number>();
    for (const a of cluster) {
      const s = new Date(a.startsAt).getTime();
      let lane = laneEnds.findIndex((end) => end <= s);
      if (lane === -1) lane = laneEnds.push(0) - 1;
      laneEnds[lane] = new Date(a.endsAt).getTime();
      idx.set(a.id, lane);
    }
    for (const a of cluster) out.set(a.id, { index: idx.get(a.id)!, count: laneEnds.length });
    cluster = [];
  };
  for (const a of sorted) {
    const s = new Date(a.startsAt).getTime();
    if (cluster.length && s >= clusterEnd) flush();
    cluster.push(a);
    clusterEnd = Math.max(clusterEnd, new Date(a.endsAt).getTime());
  }
  if (cluster.length) flush();
  return out;
}

/* ─────────────────────────── Month & agenda ─────────────────────────── */

function MonthGrid({ t, intl, from, month, appts, tz, today, onDay }: { t: TFunction; intl: string; from: string; month: string; appts: Appt[]; tz: string; today: string; onDay: (d: string) => void }) {
  const byDay = new Map<string, Appt[]>();
  for (const a of appts) {
    const d = localDayOf(a.startsAt, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }
  const days = Array.from({ length: 42 }, (_, i) => addDaysIso(from, i));
  return (
    <div className="px-2 py-3 sm:px-6 lg:px-8">
      <div className="grid grid-cols-7 text-center text-[12px] font-medium text-ink-3">
        {[1, 2, 3, 4, 5, 6, 7].map((wd) => (
          <div key={wd} className="py-2">
            {new Intl.DateTimeFormat(intl, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, wd)))}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border-s border-t border-line">
        {days.map((d) => {
          const list = (byDay.get(d) ?? []).filter((a) => !["cancelled", "declined", "expired"].includes(a.status));
          const inMonth = d.startsWith(month);
          return (
            <button key={d} type="button" onClick={() => onDay(d)} className={cn("flex min-h-[72px] flex-col items-stretch border-b border-e border-line p-1.5 text-start transition-colors hover:bg-surface sm:min-h-[104px]", !inMonth && "bg-surface-2/40")}>
              <span className={cn("mb-1 flex size-6 items-center justify-center self-start rounded-full text-[12px] font-semibold tabular", d === today ? "bg-ink text-bg" : inMonth ? "text-ink" : "text-ink-3")}>{Number(d.slice(8))}</span>
              <span className="hidden space-y-0.5 sm:block">
                {list.slice(0, 3).map((a) => (
                  <span key={a.id} className="block truncate rounded-sm bg-surface-2 px-1 text-[11px] text-ink-2">
                    <span className="tabular">{fmtTime(a.startsAt, tz, intl).replace(":00", "")}</span> {a.customerName}
                  </span>
                ))}
                {list.length > 3 && <span className="block px-1 text-[11px] text-ink-3">{t("calendar.more", { count: list.length - 3 })}</span>}
              </span>
              {list.length > 0 && <span className="mt-auto text-[11px] font-medium text-accent-text sm:hidden">{list.length}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Agenda({ t, tRoot, intl, from, appts, tz, tones, onPick, currency, today, showMember, team }: { t: TFunction; tRoot: TFunction; intl: string; from: string; appts: Appt[]; tz: string; tones: Map<string, string>; onPick: (a: Appt) => void; currency: string; today: string; showMember: boolean; team: Member[] }) {
  const days = Array.from({ length: 14 }, (_, i) => addDaysIso(from, i));
  const groups = days.map((d) => ({ d, items: appts.filter((a) => localDayOf(a.startsAt, tz) === d && !["cancelled", "declined", "expired"].includes(a.status)) })).filter((g) => g.items.length);
  void currency;
  if (!groups.length)
    return (
      <div className="px-6 py-20 text-center">
        <p className="font-medium text-ink">{t("calendar.agendaEmpty")}</p>
        <p className="mt-1 text-sm text-ink-3">{t("calendar.agendaEmptyHint")}</p>
      </div>
    );
  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
      {groups.map(({ d, items }) => (
        <section key={d} className="py-3">
          <h2 className={cn("sticky top-[calc(56px+61px)] z-[1] -mx-1 bg-bg/95 px-1 py-2 text-[13px] font-semibold uppercase tracking-[0.06em] lg:top-[61px]", d === today ? "text-ink" : "text-ink-3")}>
            {d === today
              ? t("calendar.todayDate", { date: fmtIsoDay(d, { weekday: "long", month: "short", day: "numeric" }, intl) })
              : fmtIsoDay(d, { weekday: "long", month: "short", day: "numeric" }, intl)}
          </h2>
          <ul className="divide-y divide-line">
            {items.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => onPick(a)} className="flex w-full items-center gap-4 py-3 text-start">
                  <span className="w-[68px] shrink-0 text-end text-[14px] font-semibold text-ink tabular">{fmtTime(a.startsAt, tz, intl)}</span>
                  <span className="w-[3px] self-stretch rounded-full" style={{ background: showMember && a.memberId ? tones.get(a.memberId) : STATUS_TONE[a.status] === "attention" ? "var(--warn)" : "var(--accent)" }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-ink">{a.customerName}</span>
                    <span className="block truncate text-[13px] text-ink-3">
                      {a.serviceName}
                      {showMember && a.memberId ? ` · ${team.find((tm) => tm.id === a.memberId)?.name}` : ""}
                    </span>
                  </span>
                  {a.status !== "confirmed" && <Badge tone={STATUS_TONE[a.status]}>{tRoot(`common.appointmentStatus.${a.status}`)}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="py-6 text-center text-[13px] text-ink-3">
        {rich(t("calendar.agendaFooter"), {
          month: (c) => (
            <Link href="/pro/calendar?view=month" className="underline underline-offset-2">
              {c}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}
