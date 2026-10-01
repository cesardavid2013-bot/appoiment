import { Bell, Check, MapPin, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { MonogramCover, initials, toneFor } from "@/components/business/monogram";
import { Badge, RatingInline } from "@/components/ui/misc";
import { formatDuration, formatMoney } from "@/domain/money";
import { getI18n, getT } from "@/i18n/server";
import { cn } from "@/lib/cn";

/*
 * Live-HTML miniatures of the real product, built from the same components
 * the app uses. Names and times are illustrative and labelled as examples.
 * Times, days and amounts are formatted for the visitor's language.
 */

/** A wall-clock time on a fixed example day, split so the day period (AM/PM) can sit on its own line. */
function clock(intl: string, h: number, m: number) {
  const parts = new Intl.DateTimeFormat(intl, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).formatToParts(Date.UTC(2026, 3, 7, h, m));
  const period = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  const time = parts
    .filter((p) => p.type !== "dayPeriod")
    .map((p) => p.value)
    .join("")
    .trim();
  return { time, period, full: parts.map((p) => p.value).join("") };
}

async function demoT() {
  const [t, { intl }] = await Promise.all([getT("marketing"), getI18n()]);
  return { t: (k: string, v?: Record<string, string | number>) => t(`demo.${k}`, v), intl };
}

function Panel({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <figure className={cn("overflow-hidden rounded-xl border border-line bg-surface shadow-md", className)}>
      <figcaption className="sr-only">{label}</figcaption>
      <div aria-hidden>{children}</div>
    </figure>
  );
}

function Initials({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full text-[12px] font-medium", toneFor(name))} style={{ width: size, height: size }}>
      {initials(name)}
    </span>
  );
}

export async function TodayPanel({ className }: { className?: string }) {
  const { t, intl } = await demoT();
  const rows = [
    { at: [9, 0], service: t("today.skinFade"), client: "Marcus T.", status: <Badge tone="positive">{t("today.confirmed")}</Badge> },
    { at: [10, 0], service: t("today.beardTrim"), client: "Dev P.", status: <Badge tone="info">{t("today.depositPaid")}</Badge> },
    { at: [11, 30], service: t("today.lunch"), client: null, status: null },
    { at: [12, 15], service: t("today.signatureCut"), client: t("today.firstVisit", { name: "Ana R." }), status: <Badge tone="attention">{t("today.needsApproval")}</Badge> },
    { at: [14, 0], service: t("today.kidsCut"), client: "Leo M.", status: <Badge tone="neutral">{t("today.checkedIn")}</Badge> },
  ];
  return (
    <Panel className={className} label={t("today.label")}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div>
          <p className="text-sm font-semibold text-ink">{t("today.title")}</p>
          <p className="text-[12px] text-ink-3">{t("today.summary", { count: 4, amount: formatMoney(21500, "USD", { compact: true, intl }) })}</p>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">{t("example")}</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const c = clock(intl, r.at[0], r.at[1]);
          return (
            <li key={c.full} className={cn("grid grid-cols-[64px_1fr_auto] items-center gap-3 px-4 py-3 sm:px-5", !r.client && "bg-surface-2/60")}>
              <span className="leading-tight tabular">
                <span className="block text-[15px] font-semibold text-ink">{c.time}</span>
                {c.period && <span className="block text-[11px] font-medium text-ink-3">{c.period}</span>}
              </span>
              <span className="min-w-0">
                <span className={cn("block truncate text-sm font-medium", r.client ? "text-ink" : "text-ink-3")}>{r.service}</span>
                {r.client && <span className="block truncate text-[12px] text-ink-3">{r.client}</span>}
              </span>
              <span className="shrink-0">{r.status}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export async function ReminderCard({ className }: { className?: string }) {
  const { t, intl } = await demoT();
  return (
    <Panel className={cn("p-4", className)} label={t("reminder.label")}>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
          <Bell className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center justify-between gap-3 text-[13px] text-ink-3">
            <span className="font-medium text-ink-2">Kept</span>
            <span>{t("reminder.when")}</span>
          </p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{t("reminder.title", { service: t("today.skinFade") })}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-3">{t("reminder.body", { time: clock(intl, 9, 0).full })}</p>
        </div>
      </div>
    </Panel>
  );
}

// An example week: Monday 6 to Friday 10 April 2026, Wednesday closed.
const DAYS = [
  { day: 6, open: true },
  { day: 7, open: true, active: true },
  { day: 8, open: false },
  { day: 9, open: true },
  { day: 10, open: true },
];
const SLOTS = [
  { at: [9, 0], taken: true },
  { at: [9, 45], taken: false },
  { at: [10, 30], taken: true },
  { at: [11, 15], taken: false, chosen: true },
  { at: [13, 0], taken: false },
  { at: [13, 45], taken: true },
];

export async function BookingGridPanel({ className }: { className?: string }) {
  const { t, intl } = await demoT();
  const weekday = new Intl.DateTimeFormat(intl, { weekday: "narrow", timeZone: "UTC" });
  const dayNum = new Intl.DateTimeFormat(intl, { day: "numeric", timeZone: "UTC" });
  return (
    <Panel className={cn("p-4 sm:p-5", className)} label={t("grid.label")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">{t("grid.title")}</p>
        <span className="flex items-center gap-1 text-end text-[12px] text-ink-3">
          <Zap className="size-3.5 shrink-0 text-accent" /> {t("grid.instant")}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {DAYS.map((x) => {
          const date = Date.UTC(2026, 3, x.day, 12);
          return (
            <span key={x.day} className={cn("flex h-14 flex-col items-center justify-center rounded-md border text-xs", x.active ? "border-ink bg-ink text-bg" : x.open ? "border-line bg-surface text-ink" : "border-transparent text-ink-3")}>
              <span className="uppercase">{weekday.format(date)}</span>
              <span className="text-[15px] font-semibold">{dayNum.format(date)}</span>
            </span>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {SLOTS.map((s) => {
          const label = clock(intl, s.at[0], s.at[1]).time;
          return (
            <span
              key={label}
              className={cn(
                "flex h-10 items-center justify-center rounded-md border text-sm font-semibold tabular",
                s.chosen ? "border-ink bg-ink text-bg" : s.taken ? "border-dashed border-line-strong text-ink-3 line-through" : "border-line-strong bg-surface text-ink",
              )}
            >
              {label}
            </span>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] leading-snug text-ink-3">{t("grid.note")}</p>
    </Panel>
  );
}

export async function PolicyPanel({ className }: { className?: string }) {
  const { t, intl } = await demoT();
  const pct = (n: number) => new Intl.NumberFormat(intl, { style: "percent" }).format(n);
  const rows = [
    [t("policy.deposit"), t("policy.depositValue", { pct: pct(0.25) })],
    [t("policy.freeCancel"), t("policy.freeCancelValue")],
    [t("policy.lateCancel"), t("policy.lateCancelValue", { pct: pct(0.5) })],
    [t("policy.noShow"), t("policy.noShowValue")],
  ];
  return (
    <Panel className={cn("p-4 sm:p-5", className)} label={t("policy.label")}>
      <p className="text-sm font-semibold text-ink">{t("policy.title")}</p>
      <dl className="mt-3 divide-y divide-line border-y border-line text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-ink-3">{k}</dt>
            <dd className="text-end font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-surface-2 px-3 py-2.5 text-[13px]">
        <span className="text-ink-2">{t("policy.dueNow")}</span>
        <span className="text-end font-semibold text-ink tabular">{t("policy.dueValue", { due: formatMoney(1500, "USD", { intl }), total: formatMoney(6000, "USD", { intl }) })}</span>
      </div>
    </Panel>
  );
}

export async function ClientCardPanel({ className }: { className?: string }) {
  const { t, intl } = await demoT();
  const month = new Intl.DateTimeFormat(intl, { month: "long", timeZone: "UTC" }).format(Date.UTC(2026, 2, 15));
  return (
    <Panel className={cn("p-4 sm:p-5", className)} label={t("client.label")}>
      <div className="flex items-center gap-3">
        <Initials name="Priya Shah" size={40} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Priya Shah</p>
          <p className="text-[12px] text-ink-3">{t("client.since", { month, visits: 7 })}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 divide-x divide-line rounded-md border border-line text-center">
        {[
          [formatMoney(42000, "USD", { compact: true, intl }), t("client.spent")],
          [new Intl.NumberFormat(intl).format(0), t("client.noShows")],
          [t("client.gapValue", { weeks: 3 }), t("client.gap")],
        ].map(([v, l]) => (
          <div key={l} className="px-1 py-2">
            <p className="text-sm font-semibold text-ink tabular">{v}</p>
            <p className="text-[11px] text-ink-3">{l}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-[12px] leading-snug text-warn">{t("client.note")}</p>
    </Panel>
  );
}

export async function TeamPanel({ className }: { className?: string }) {
  const { t } = await demoT();
  const team = [
    { name: "Dre Coleman", role: t("team.senior"), loc: "Brooklyn" },
    { name: "Luis Ortega", role: t("team.barber"), loc: "Brooklyn · Queens" },
    { name: "Kim Tran", role: t("team.frontDesk"), loc: "Queens" },
  ];
  return (
    <Panel className={cn("p-4 sm:p-5", className)} label={t("team.label")}>
      <p className="text-sm font-semibold text-ink">{t("team.title")}</p>
      <ul className="mt-3 space-y-3">
        {team.map((m) => (
          <li key={m.name} className="flex items-center gap-3">
            <Initials name={m.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{m.name}</p>
              <p className="flex items-center gap-1 truncate text-[12px] text-ink-3">
                {m.role} · <MapPin className="size-3 shrink-0" /> {m.loc}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export async function PortfolioPanel({ className }: { className?: string }) {
  const { t, intl } = await demoT();
  const items = [
    { name: t("portfolio.skinFade"), minutes: 45, cents: 5000 },
    { name: t("portfolio.taper"), minutes: 60, cents: 6500 },
  ];
  return (
    <Panel className={cn("p-4 sm:p-5", className)} label={t("portfolio.label")}>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.name} className="overflow-hidden rounded-lg border border-line">
            <MonogramCover name={it.name} className="aspect-square" size="sm" />
            <div className="p-2.5">
              <p className="truncate text-[13px] font-medium text-ink">{it.name}</p>
              <p className="text-[11px] text-ink-3">
                {formatDuration(it.minutes, intl)} · {formatMoney(it.cents, "USD", { compact: true, intl })}
              </p>
              <span className="mt-2 flex h-8 items-center justify-center rounded-md bg-ink px-2 text-center text-[12px] font-medium text-bg">{t("portfolio.bookThis")}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-snug text-ink-3">{t("portfolio.note")}</p>
    </Panel>
  );
}

export async function SpotlightPanel({ className }: { className?: string }) {
  const { t, intl } = await demoT();
  return (
    <Panel className={cn("p-4 sm:p-5", className)} label={t("spotlight.label")}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full font-display text-xl", toneFor("North Fade Studio"))}>NF</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">North Fade Studio</p>
          <p className="truncate text-[13px] text-ink-3">{t("spotlight.category")} · Brooklyn</p>
          <div className="mt-1 flex items-center gap-2">
            <RatingInline avg={4.9} count={38} />
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">· {t("spotlight.promoted")}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-1.5">
        {[
          [10, 0],
          [11, 30],
          [14, 0],
        ].map(([h, m]) => {
          const label = clock(intl, h, m).full;
          return (
            <span key={label} className="flex h-8 flex-1 items-center justify-center whitespace-nowrap rounded-md border border-accent/25 bg-accent-soft px-1 text-[13px] font-semibold text-accent-text tabular">
              {label}
            </span>
          );
        })}
      </div>
    </Panel>
  );
}

export function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[15px] leading-relaxed text-ink-2">
      <Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden />
      <span>{children}</span>
    </li>
  );
}
