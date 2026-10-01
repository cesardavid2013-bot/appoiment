"use client";

import { CalendarOff, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input } from "@/components/ui/field";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { clockToMinutes, minutesToClock, WEEKDAYS } from "@/domain/time";
import { useLocale, useT } from "@/i18n/client";
import type { TFunction } from "@/i18n/translate";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDate, fmtTime, localDateKey } from "@/lib/format";
import { BlockTimeDialog, REASONS } from "./pro-dialogs";
import { hoursAreValid, minutesLabel, WeeklyHoursEditor, weekdayLabel, type DayHours } from "./weekly-hours-editor";

type Window = { start: number; end: number };
type Override = { id: string; date: string; intervals: Window[]; note: string | null; memberId: string | null };
type Block = { id: string; memberId: string | null; startsAt: string; endsAt: string; reason: string; note: string | null };

const clock = (m: number, intl: string, t: TFunction) => minutesLabel(m, intl, { compact: true, midnight: t("hours.midnightLower") });
const hoursLabel = (ws: Window[], intl: string, t: TFunction) => ws.map((w) => `${clock(w.start, intl, t)}–${clock(w.end, intl, t)}`).join(", ");
const totalMinutes = (days: DayHours[]) => days.reduce((s, d) => s + d.windows.reduce((a, w) => a + (w.end - w.start), 0), 0);
function reasonLabel(r: string, t: TFunction) {
  const fallback = REASONS.find(([v]) => v === r)?.[1];
  if (!fallback) return t("availability.timeOff");
  const key = `availability.reason.${r}`;
  const v = t(key);
  return v === `proSetup.${key}` ? fallback : v;
}

export function AvailabilityManager(props: {
  timezone: string;
  today: string;
  canAll: boolean;
  selfMemberId: string;
  team: { id: string; name: string }[];
  selected: { id: string; name: string } | null;
  weekly: (DayHours & { locationId: string | null })[];
  overrides: Override[];
  blocks: Block[];
}) {
  const { timezone, selected, team } = props;
  const t = useT("proSetup");
  const { intl } = useLocale();
  const router = useRouter();
  const [days, setDays] = useState<DayHours[]>(props.weekly.map(({ weekday, windows }) => ({ weekday, windows })));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [removing, setRemoving] = useState<{ kind: "block" | "override"; id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const self = selected?.id === props.selfMemberId;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!selected)
    return (
      <>
        <PageHeader title={t("availability.title")} />
        <EmptyState className="mt-8" title={t("availability.emptyTitle")} description={t("availability.emptyBody")} />
      </>
    );

  const valid = hoursAreValid(days);
  const total = totalMinutes(days);
  const openDays = days.filter((d) => d.windows.length).length;

  async function saveWeekly() {
    setSaving(true);
    try {
      const locByDay = new Map(props.weekly.map((d) => [d.weekday, d.locationId]));
      await api("/api/pro/schedule/weekly", { method: "PUT", body: { memberId: selected!.id, days: days.map((d) => ({ ...d, locationId: locByDay.get(d.weekday) ?? null })) } });
      setDirty(false);
      toast.success(self ? t("availability.savedSelf") : t("availability.savedOther", { name: selected!.name }), { description: t("availability.savedBody") });
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await api(removing.kind === "block" ? `/api/pro/blocks/${removing.id}` : `/api/pro/schedule/overrides/${removing.id}`, { method: "DELETE" });
      toast.success(removing.kind === "block" ? t("availability.blockRemoved") : t("availability.overrideRemoved"));
      setRemoving(null);
      router.refresh();
    } catch (err) {
      // Already gone (removed in another tab or replaced by a newer change): just show the current list.
      if ((err as ApiError).status === 404) {
        setRemoving(null);
        router.refresh();
      } else toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t("availability.title")}
        description={self ? t("availability.descriptionSelf") : t("availability.descriptionOther", { name: selected.name })}
        actions={
          <>
            <Button variant="secondary" onClick={() => setOverrideOpen(true)}>
              {t("availability.changeOneDay")}
            </Button>
            <Button onClick={() => setBlockOpen(true)} icon={<Plus className="size-4" />}>
              {t("availability.addTimeOff")}
            </Button>
          </>
        }
      />

      {team.length > 1 && (
        <nav aria-label={t("availability.teamMember")} className="relative -mx-4 mt-8 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-1.5 border-b border-line">
            {team.map((tm) => (
              <li key={tm.id}>
                <Link
                  href={`/pro/availability?member=${tm.id}`}
                  onClick={(e) => {
                    if (dirty && !window.confirm(t("availability.discardConfirm"))) e.preventDefault();
                  }}
                  aria-current={tm.id === selected.id ? "page" : undefined}
                  className={cn("-mb-px block whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium", tm.id === selected.id ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}
                >
                  {tm.id === props.selfMemberId ? t("availability.you", { name: tm.name }) : tm.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <section aria-labelledby="weekly-h" className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="weekly-h" className="text-lg font-semibold tracking-[-0.01em] text-ink">
            {t("availability.weekly")}
          </h2>
          <p className="text-sm text-ink-3 tabular">
            {total ? t("availability.weeklySummary", { hours: Math.round((total / 60) * 10) / 10, count: openDays }) : t("availability.notBookable")}
          </p>
        </div>
        <WeekGlance days={days} />
        <div className="mt-4">
          <WeeklyHoursEditor
            value={days}
            onChange={(v) => {
              setDays(v);
              setDirty(true);
            }}
          />
        </div>
      </section>

      <section aria-labelledby="dates-h" className="mt-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="dates-h" className="text-lg font-semibold tracking-[-0.01em] text-ink">
              {t("availability.datesTitle")}
            </h2>
            <p className="mt-1 text-sm text-ink-3">{t("availability.datesBody")}</p>
          </div>
        </div>
        {props.overrides.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-line-strong px-5 py-5 text-sm text-ink-3">
            {t("availability.datesEmpty")}{" "}
            <button type="button" className="font-medium text-ink underline underline-offset-2" onClick={() => setOverrideOpen(true)}>
              {t("availability.datesAction")}
            </button>
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
            {props.overrides.map((o) => (
              <li key={o.id} className="flex items-center gap-4 px-4 py-3">
                <DateTile iso={o.date} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-ink">{o.intervals.length ? hoursLabel(o.intervals, intl, t) : t("hours.closed")}</p>
                  <p className="truncate text-[13px] text-ink-3">
                    {o.date === props.today ? t("availability.today") : fmtDate(`${o.date}T12:00:00Z`, "UTC", { weekday: "long", month: "long", day: "numeric" }, intl)}
                    {o.memberId == null && ` · ${t("availability.wholeBusiness")}`}
                    {o.note && ` · ${o.note}`}
                  </p>
                </div>
                <button type="button" onClick={() => setRemoving({ kind: "override", id: o.id, label: fmtDate(`${o.date}T12:00:00Z`, "UTC", { month: "short", day: "numeric" }, intl) })} className="flex size-10 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-danger" aria-label={t("availability.removeChange", { date: fmtDate(`${o.date}T12:00:00Z`, "UTC", { month: "long", day: "numeric" }, intl) })}>
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="off-h" className="mt-12">
        <h2 id="off-h" className="text-lg font-semibold tracking-[-0.01em] text-ink">
          {t("availability.timeOff")}
        </h2>
        <p className="mt-1 text-sm text-ink-3">{t("availability.timeOffBody")}</p>
        {props.blocks.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-line-strong px-5 py-5 text-sm text-ink-3">
            {t("availability.timeOffEmpty")}{" "}
            <button type="button" className="font-medium text-ink underline underline-offset-2" onClick={() => setBlockOpen(true)}>
              {t("availability.addTimeOff")}
            </button>
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
            {props.blocks.map((b) => {
              const when = describeBlock(b, timezone, intl, t);
              return (
                <li key={b.id} className="flex items-center gap-4 px-4 py-3">
                  <DateTile iso={localDateKey(b.startsAt, timezone)} muted />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
                      {when.title}
                      <Badge>{reasonLabel(b.reason, t)}</Badge>
                      {b.memberId == null && <Badge tone="attention">{t("availability.businessClosed")}</Badge>}
                    </p>
                    <p className="truncate text-[13px] text-ink-3">
                      {when.detail}
                      {b.note && ` · ${b.note}`}
                    </p>
                  </div>
                  {(b.memberId != null || props.canAll) && (
                    <button type="button" onClick={() => setRemoving({ kind: "block", id: b.id, label: when.title })} className="flex size-10 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-danger" aria-label={t("availability.removeTimeOff", { when: when.title })}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {dirty && (
        <div className="fixed inset-x-0 bottom-[58px] z-30 border-t border-line bg-surface lg:bottom-0 lg:start-[248px]">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
            <p className="text-sm text-ink-3" aria-live="polite">
              {valid ? t("availability.unsaved") : <span className="text-danger">{t("availability.invalid")}</span>}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setDays(props.weekly.map(({ weekday, windows }) => ({ weekday, windows })));
                  setDirty(false);
                }}
                disabled={saving}
              >
                {t("availability.discard")}
              </Button>
              <Button onClick={saveWeekly} loading={saving} disabled={!valid}>
                {t("availability.saveHours")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <BlockTimeDialog open={blockOpen} onOpenChange={setBlockOpen} team={team} timezone={timezone} canAll={props.canAll} selfMemberId={selected.id} />
      <OverrideDialog open={overrideOpen} onOpenChange={setOverrideOpen} memberId={selected.id} today={props.today} weekly={days} />
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing?.kind === "block" ? t("availability.removeBlockTitle") : t("availability.removeOverrideTitle")}
        description={removing?.kind === "block" ? t("availability.removeBlockBody", { label: removing.label }) : t("availability.removeOverrideBody", { label: removing?.label ?? "" })}
        confirmLabel={t("availability.remove")}
        onConfirm={remove}
        loading={busy}
      />
    </>
  );
}

/** One-glance view of the week: a bar per day across the working span. */
function WeekGlance({ days }: { days: DayHours[] }) {
  const t = useT("proSetup");
  const { intl } = useLocale();
  const all = days.flatMap((d) => d.windows);
  const from = all.length ? Math.floor(Math.min(...all.map((w) => w.start)) / 60) * 60 : 480;
  const to = all.length ? Math.ceil(Math.max(...all.map((w) => w.end)) / 60) * 60 : 1200;
  const span = Math.max(60, to - from);
  const ticks = useMemo(() => {
    const step = span > 720 ? 240 : span > 360 ? 120 : 60;
    const out: number[] = [];
    for (let m = from; m <= to; m += step) out.push(m);
    return out;
  }, [from, to, span]);
  if (!all.length) return null;
  return (
    <div className="mt-4 rounded-lg border border-line bg-surface px-4 py-4" aria-hidden>
      <div className="grid grid-cols-[36px_1fr] gap-x-3 gap-y-1.5">
        {WEEKDAYS.map((wd) => {
          const d = days.find((x) => x.weekday === wd.value);
          return (
            <div key={wd.value} className="contents">
              <span className="text-[12px] font-medium leading-4 text-ink-3">{weekdayLabel(wd.value, intl, "short")}</span>
              <div className="relative h-4 rounded-sm bg-surface-2">
                {d?.windows.map((w, i) => (
                  <span key={i} className="absolute inset-y-0 rounded-sm bg-accent/85" style={{ left: `${((w.start - from) / span) * 100}%`, width: `${((w.end - w.start) / span) * 100}%` }} />
                ))}
              </div>
            </div>
          );
        })}
        <span />
        <div className="relative mt-1 h-4">
          {ticks.map((m) => (
            <span key={m} className="absolute -translate-x-1/2 text-[11px] text-ink-3 tabular first:translate-x-0 last:-translate-x-full" style={{ left: `${((m - from) / span) * 100}%` }}>
              {clock(m, intl, t)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function DateTile({ iso, muted }: { iso: string; muted?: boolean }) {
  const { intl } = useLocale();
  const d = new Date(`${iso}T12:00:00Z`);
  return (
    <div className={cn("flex w-11 shrink-0 flex-col items-center rounded-md border py-1", muted ? "border-line bg-surface-2" : "border-line-strong")}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">{fmtDate(d, "UTC", { month: "short" }, intl)}</span>
      <span className="text-[17px] font-semibold leading-5 text-ink tabular">{fmtDate(d, "UTC", { day: "numeric" }, intl)}</span>
    </div>
  );
}

function describeBlock(b: Block, tz: string, intl: string, t: TFunction) {
  const startDay = localDateKey(b.startsAt, tz);
  const endDay = localDateKey(new Date(new Date(b.endsAt).getTime() - 1), tz);
  const startsMidnight = fmtTime(b.startsAt, tz) === "12:00 AM";
  const endsMidnight = fmtTime(b.endsAt, tz) === "12:00 AM";
  const day = (iso: string, o: Intl.DateTimeFormatOptions) => fmtDate(`${iso}T12:00:00Z`, "UTC", o, intl);
  const time = (iso: string) => fmtTime(iso, tz, intl);
  if (startsMidnight && endsMidnight) {
    const n = Math.round((Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`)) / 86_400_000) + 1;
    return startDay === endDay
      ? { title: day(startDay, { weekday: "long", month: "short", day: "numeric" }), detail: t("availability.allDay") }
      : { title: `${day(startDay, { month: "short", day: "numeric" })} – ${day(endDay, { month: "short", day: "numeric" })}`, detail: t("availability.days", { count: n }) };
  }
  if (startDay === endDay) return { title: day(startDay, { weekday: "short", month: "short", day: "numeric" }), detail: `${time(b.startsAt)} – ${time(b.endsAt)}` };
  return { title: `${day(startDay, { month: "short", day: "numeric" })} – ${day(endDay, { month: "short", day: "numeric" })}`, detail: t("availability.fromTo", { from: time(b.startsAt), to: time(b.endsAt) }) };
}

function OverrideDialog({ open, onOpenChange, memberId, today, weekly }: { open: boolean; onOpenChange: (o: boolean) => void; memberId: string; today: string; weekly: DayHours[] }) {
  const t = useT("proSetup");
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<"closed" | "hours">("hours");
  const [windows, setWindows] = useState([{ from: "10:00", to: "16:00" }]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickDate(v: string) {
    setDate(v);
    // Start from that weekday's regular hours so a small change is a small edit.
    const wd = ((new Date(`${v}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const reg = weekly.find((d) => d.weekday === wd)?.windows ?? [];
    if (reg.length) setWindows(reg.map((w) => ({ from: minutesToClock(w.start), to: minutesToClock(Math.min(w.end, 1439)) })));
  }

  async function save() {
    setError(null);
    const parsed = windows.map((w) => ({ start: clockToMinutes(w.from), end: clockToMinutes(w.to) }));
    if (mode === "hours" && parsed.some((w) => w.start == null || w.end == null || w.end <= w.start)) return setError(t("override.errorRange"));
    if (!date || date < today) return setError(t("override.errorDate"));
    setSaving(true);
    try {
      await api("/api/pro/schedule/overrides", { body: { memberId, date, windows: mode === "closed" ? [] : parsed, note: note.trim() || null } });
      toast.success(mode === "closed" ? t("override.savedClosed") : t("override.savedHours"));
      onOpenChange(false);
      setNote("");
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("override.title")}
      description={t("override.description")}
      size="sm"
      locked={saving}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("override.cancel")}
          </Button>
          <Button onClick={save} loading={saving}>
            {t("override.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <Field label={t("override.date")}>{(p) => <Input {...p} type="date" value={date} min={today} onChange={(e) => pickDate(e.target.value)} />}</Field>
        <Segmented label={t("override.thatDay")} value={mode} onChange={setMode} options={[{ value: "hours", label: t("override.differentHours") }, { value: "closed", label: t("hours.closed") }]} />
        {mode === "hours" ? (
          <div className="space-y-2">
            {windows.map((w, i) => (
              <div key={i} className="flex items-end gap-2">
                <Field label={i === 0 ? t("override.from") : t("override.thenFrom")} className="flex-1">
                  {(p) => <Input {...p} type="time" step={900} value={w.from} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} />}
                </Field>
                <Field label={t("override.to")} className="flex-1">
                  {(p) => <Input {...p} type="time" step={900} value={w.to} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} />}
                </Field>
                {windows.length > 1 && (
                  <button type="button" onClick={() => setWindows(windows.filter((_, j) => j !== i))} className="mb-0.5 flex size-10 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2" aria-label={t("hours.removeRange")}>
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
            {windows.length < 4 && (
              <button type="button" onClick={() => setWindows([...windows, { from: "17:00", to: "19:00" }])} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
                <Plus className="size-3.5" /> {t("hours.addAfterBreak")}
              </button>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
            <CalendarOff className="size-4 text-ink-3" /> {t("override.closedNote")}
          </p>
        )}
        <Field label={t("override.note")} optional hint={t("override.noteHint")}>
          {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={t("override.notePlaceholder")} />}
        </Field>
      </div>
    </Dialog>
  );
}
