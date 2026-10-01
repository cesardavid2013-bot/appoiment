import { Bell, Check, MapPin, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { MonogramCover, initials, toneFor } from "@/components/business/monogram";
import { Badge, RatingInline } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

/*
 * Live-HTML miniatures of the real product, built from the same components
 * the app uses. Names and times are illustrative and labelled as examples.
 */

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

const TODAY = [
  { time: "9:00", ap: "AM", service: "Skin fade", client: "Marcus T.", status: <Badge tone="positive">Confirmed</Badge> },
  { time: "10:00", ap: "AM", service: "Beard trim & line-up", client: "Dev P.", status: <Badge tone="info">Deposit paid</Badge> },
  { time: "11:30", ap: "AM", service: "Lunch", client: null, status: null },
  { time: "12:15", ap: "PM", service: "Signature cut", client: "Ana R. · first visit", status: <Badge tone="attention">Needs approval</Badge> },
  { time: "2:00", ap: "PM", service: "Kids cut", client: "Leo M.", status: <Badge tone="neutral">Checked in</Badge> },
];

export function TodayPanel({ className }: { className?: string }) {
  return (
    <Panel className={className} label="Example of the Today schedule a professional sees">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <div>
          <p className="text-sm font-semibold text-ink">Today</p>
          <p className="text-[12px] text-ink-3">4 appointments · $215 booked</p>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">Example</span>
      </div>
      <ul className="divide-y divide-line">
        {TODAY.map((r) => (
          <li key={r.time} className={cn("grid grid-cols-[56px_1fr_auto] items-center gap-3 px-4 py-3 sm:px-5", !r.client && "bg-surface-2/60")}>
            <span className="leading-tight tabular">
              <span className="block text-[15px] font-semibold text-ink">{r.time}</span>
              <span className="block text-[11px] font-medium text-ink-3">{r.ap}</span>
            </span>
            <span className="min-w-0">
              <span className={cn("block truncate text-sm font-medium", r.client ? "text-ink" : "text-ink-3")}>{r.service}</span>
              {r.client && <span className="block truncate text-[12px] text-ink-3">{r.client}</span>}
            </span>
            <span className="shrink-0">{r.status}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ReminderCard({ className }: { className?: string }) {
  return (
    <Panel className={cn("p-4", className)} label="Example of an automatic reminder a client receives">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
          <Bell className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center justify-between gap-3 text-[13px] text-ink-3">
            <span className="font-medium text-ink-2">Kept</span>
            <span>24h before</span>
          </p>
          <p className="mt-0.5 text-sm font-semibold text-ink">Reminder: Skin fade tomorrow</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-3">9:00 AM with Dre at North Fade Studio. Need to change it? Reschedule up to 24h before.</p>
        </div>
      </div>
    </Panel>
  );
}

const DAYS = [
  { d: "Mon", n: 6, open: true },
  { d: "Tue", n: 7, open: true, active: true },
  { d: "Wed", n: 8, open: false },
  { d: "Thu", n: 9, open: true },
  { d: "Fri", n: 10, open: true },
];
const SLOTS = [
  { t: "9:00", taken: true },
  { t: "9:45", taken: false },
  { t: "10:30", taken: true },
  { t: "11:15", taken: false, chosen: true },
  { t: "1:00", taken: false },
  { t: "1:45", taken: true },
];

export function BookingGridPanel({ className }: { className?: string }) {
  return (
    <Panel className={cn("p-4 sm:p-5", className)} label="Example of the time picker customers book from, showing only open times">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-ink">Choose a time</p>
        <span className="flex items-center gap-1 text-[12px] text-ink-3">
          <Zap className="size-3.5 text-accent" /> Instant confirmation
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {DAYS.map((x) => (
          <span key={x.d} className={cn("flex h-14 flex-col items-center justify-center rounded-md border text-xs", x.active ? "border-ink bg-ink text-bg" : x.open ? "border-line bg-surface text-ink" : "border-transparent text-ink-3")}>
            <span className="uppercase">{x.d.slice(0, 1)}</span>
            <span className="text-[15px] font-semibold">{x.n}</span>
          </span>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {SLOTS.map((s) => (
          <span
            key={s.t}
            className={cn(
              "flex h-10 items-center justify-center rounded-md border text-sm font-semibold tabular",
              s.chosen ? "border-ink bg-ink text-bg" : s.taken ? "border-dashed border-line-strong text-ink-3 line-through" : "border-line-strong bg-surface text-ink",
            )}
          >
            {s.t}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-snug text-ink-3">Taken times disappear the moment someone books. Two people can never get the same slot.</p>
    </Panel>
  );
}

export function PolicyPanel({ className }: { className?: string }) {
  const rows = [
    ["Deposit", "25% at booking"],
    ["Free cancellation", "Up to 24h before"],
    ["Late cancellation", "50% of the total"],
    ["No-show", "Deposit kept"],
  ];
  return (
    <Panel className={cn("p-4 sm:p-5", className)} label="Example of a deposit and cancellation policy">
      <p className="text-sm font-semibold text-ink">Booking policy</p>
      <dl className="mt-3 divide-y divide-line border-y border-line text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-ink-3">{k}</dt>
            <dd className="font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-center justify-between rounded-md bg-surface-2 px-3 py-2.5 text-[13px]">
        <span className="text-ink-2">Due now</span>
        <span className="font-semibold text-ink tabular">$15.00 of $60.00</span>
      </div>
    </Panel>
  );
}

export function ClientCardPanel({ className }: { className?: string }) {
  return (
    <Panel className={cn("p-4 sm:p-5", className)} label="Example of a client record">
      <div className="flex items-center gap-3">
        <Initials name="Priya Shah" size={40} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Priya Shah</p>
          <p className="text-[12px] text-ink-3">Client since March · 7 visits</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 divide-x divide-line rounded-md border border-line text-center">
        {[
          ["$420", "Spent"],
          ["0", "No-shows"],
          ["3 wk", "Usual gap"],
        ].map(([v, l]) => (
          <div key={l} className="py-2">
            <p className="text-sm font-semibold text-ink tabular">{v}</p>
            <p className="text-[11px] text-ink-3">{l}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-[12px] leading-snug text-warn">Private note: sensitive scalp — use the gentle shampoo.</p>
    </Panel>
  );
}

export function TeamPanel({ className }: { className?: string }) {
  const team = [
    { name: "Dre Coleman", role: "Senior barber", loc: "Brooklyn" },
    { name: "Luis Ortega", role: "Barber", loc: "Brooklyn · Queens" },
    { name: "Kim Tran", role: "Front desk", loc: "Queens" },
  ];
  return (
    <Panel className={cn("p-4 sm:p-5", className)} label="Example of a team across two locations">
      <p className="text-sm font-semibold text-ink">Team</p>
      <ul className="mt-3 space-y-3">
        {team.map((m) => (
          <li key={m.name} className="flex items-center gap-3">
            <Initials name={m.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{m.name}</p>
              <p className="flex items-center gap-1 truncate text-[12px] text-ink-3">
                {m.role} · <MapPin className="size-3" /> {m.loc}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function PortfolioPanel({ className }: { className?: string }) {
  const items = [
    { name: "Skin fade", meta: "45 min · $50" },
    { name: "Taper & beard", meta: "1 hr · $65" },
  ];
  return (
    <Panel className={cn("p-4 sm:p-5", className)} label="Example of portfolio posts linked to a bookable service">
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.name} className="overflow-hidden rounded-lg border border-line">
            <MonogramCover name={it.name} className="aspect-square" size="sm" />
            <div className="p-2.5">
              <p className="truncate text-[13px] font-medium text-ink">{it.name}</p>
              <p className="text-[11px] text-ink-3">{it.meta}</p>
              <span className="mt-2 flex h-8 items-center justify-center rounded-md bg-ink text-[12px] font-medium text-bg">Book this</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-snug text-ink-3">Your photos and videos appear here — tap one to book that exact service.</p>
    </Panel>
  );
}

export function SpotlightPanel({ className }: { className?: string }) {
  return (
    <Panel className={cn("p-4 sm:p-5", className)} label="Example of a promoted listing in search results">
      <div className="flex items-start gap-3">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full font-display text-xl", toneFor("North Fade Studio"))}>NF</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">North Fade Studio</p>
          <p className="truncate text-[13px] text-ink-3">Barber · Brooklyn</p>
          <div className="mt-1 flex items-center gap-2">
            <RatingInline avg={4.9} count={38} />
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">· Promoted</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-1.5">
        {["10 AM", "11:30", "2 PM"].map((t) => (
          <span key={t} className="flex h-8 flex-1 items-center justify-center rounded-md border border-accent/25 bg-accent-soft text-[13px] font-semibold text-accent-text tabular">
            {t}
          </span>
        ))}
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

