import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";

/* ─────────────────────────── URL helpers ─────────────────────────── */

export type Params = Record<string, string | undefined>;

/** Builds `path?query` from current params with overrides; empty values are dropped. */
export function hrefWith(path: string, params: Params, overrides: Params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...overrides })) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

/** Normalises Next search params to single strings. */
export function flatParams(sp: Record<string, string | string[] | undefined>): Params {
  const out: Params = {};
  for (const [k, v] of Object.entries(sp)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

export function pageParam(v: string | undefined) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/* ─────────────────────────── Formatting ──────────────────────────── */

const stampFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function fmtStamp(d: Date | string | null | undefined) {
  return d ? stampFmt.format(new Date(d)) : "—";
}
const clockFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "UTC", timeZoneName: "short" });
export function fmtClock(d: Date | string | null | undefined) {
  return d ? clockFmt.format(new Date(d)) : "—";
}
export function fmtDay(d: Date | string | null | undefined) {
  return d ? dayFmt.format(new Date(d)) : "—";
}

/** Relative time with the exact UTC timestamp available on hover and to screen readers. */
export function When({ at, className }: { at: Date | string | null | undefined; className?: string }) {
  if (!at) return <span className={cn("text-ink-3", className)}>—</span>;
  const iso = new Date(at).toISOString();
  return (
    <time dateTime={iso} title={fmtStamp(at)} className={cn("whitespace-nowrap tabular", className)}>
      {timeAgo(at)}
    </time>
  );
}

export const humanize = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function pct(n: number, d: number) {
  if (!d) return "—";
  const v = (n / d) * 100;
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}%`;
}

export const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(n);

/* ───────────────────────────── Layout ────────────────────────────── */

export function AdminHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
            <ChevronLeft className="size-4" aria-hidden />
            {back.label}
          </Link>
        )}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-ink text-balance break-words">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-3 text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ title, description, action, children, className, bodyClassName, id }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-line bg-surface", className)} aria-labelledby={title && id ? id : undefined}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 id={id} className="text-sm font-semibold text-ink">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn("min-w-0", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Definition list for record details. */
export function Facts({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-4 py-2.5 text-sm">
          <dt className="text-ink-3">{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v ?? <span className="text-ink-3">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[12px] text-ink-2", className)}>{children}</span>;
}

/* ───────────────────────────── Tables ────────────────────────────── */

export function Table({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <div className={cn("relative overflow-x-auto", className)}>
      <table className="w-full min-w-[720px] border-collapse text-start text-sm" aria-label={label}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-line bg-surface-2/60 text-[12px] font-medium uppercase tracking-wide text-ink-3">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ children, className, align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" }) {
  return (
    <th scope="col" className={cn("whitespace-nowrap px-4 py-2.5 font-medium", align === "right" && "text-end", className)}>
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("align-top transition-colors hover:bg-surface-2/50", className)}>{children}</tr>;
}

export function Td({ children, className, align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" }) {
  return <td className={cn("px-4 py-3 text-ink", align === "right" && "text-end tabular", className)}>{children}</td>;
}

/** Primary cell: bold link plus a muted second line. */
export function CellLink({ href, title, sub }: { href: string; title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <Link href={href} className="font-medium text-ink underline-offset-4 hover:underline">
        {title}
      </Link>
      {sub && <div className="mt-0.5 truncate text-[13px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function TableEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-3">{description}</p>}
    </div>
  );
}

/* ─────────────────────────── Navigation ──────────────────────────── */

export function Pager({ path, params, page, hasMore, label = "Pagination" }: { path: string; params: Params; page: number; hasMore: boolean; label?: string }) {
  if (page <= 1 && !hasMore) return null;
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-line px-4 py-3" aria-label={label}>
      <span className="text-[13px] text-ink-3 tabular">Page {page}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefWith(path, params, { page: page - 1 > 1 ? String(page - 1) : undefined })} className={buttonClass("secondary", "sm")} rel="prev">
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </Link>
        ) : (
          <span className={cn(buttonClass("secondary", "sm"), "pointer-events-none opacity-40")} aria-disabled>
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </span>
        )}
        {hasMore ? (
          <Link href={hrefWith(path, params, { page: String(page + 1) })} className={buttonClass("secondary", "sm")} rel="next">
            Next
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={cn(buttonClass("secondary", "sm"), "pointer-events-none opacity-40")} aria-disabled>
            Next
            <ChevronRight className="size-4" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}

/** Link-based filter tabs (server-rendered, so filters are shareable URLs). */
export function FilterTabs({ path, params, name, value, options, label }: { path: string; params: Params; name: string; value: string; options: { value: string; label: string; count?: number }[]; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
      <ul className="inline-flex min-w-max gap-1 rounded-lg border border-line bg-surface-2 p-0.5">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <li key={o.value}>
              <Link
                href={hrefWith(path, params, { [name]: o.value, page: undefined, before: undefined })}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-8 items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium transition-colors", active ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink")}
              >
                {o.label}
                {o.count ? <span className="rounded-sm bg-surface-3 px-1.5 text-[11px] tabular text-ink-2">{o.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Plain GET form for search + selects. Works without JavaScript; the other
 * current params are preserved as hidden inputs.
 */
export function FilterForm({
  path,
  params,
  q,
  placeholder,
  selects = [],
  keep = [],
}: {
  path: string;
  params: Params;
  q?: { name?: string; label: string };
  placeholder?: string;
  selects?: { name: string; label: string; options: { value: string; label: string }[] }[];
  keep?: string[];
}) {
  const qName = q?.name ?? "q";
  return (
    <form action={path} method="get" role="search" className="flex flex-wrap items-center gap-2">
      {keep.map((k) => (params[k] ? <input key={k} type="hidden" name={k} value={params[k]} /> : null))}
      {q && (
        <label className="relative w-full min-w-0 sm:w-auto sm:max-w-sm sm:flex-1">
          <span className="sr-only">{q.label}</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            name={qName}
            defaultValue={params[qName] ?? ""}
            placeholder={placeholder}
            className="h-10 w-full rounded-md border border-line-strong bg-surface ps-9 pe-3 text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15"
          />
        </label>
      )}
      {selects.map((s) => (
        <label key={s.name} className="relative min-w-[140px] flex-1 sm:flex-none">
          <span className="sr-only">{s.label}</span>
          <select
            name={s.name}
            defaultValue={params[s.name] ?? ""}
            className="h-10 w-full cursor-pointer appearance-none rounded-md border border-line-strong bg-surface ps-3 pe-9 text-ink focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 sm:w-auto"
          >
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <svg className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </label>
      ))}
      <div className="flex gap-2">
        <button type="submit" className={buttonClass("primary", "md", "h-10")}>
          Apply
        </button>
        {[qName, ...selects.map((s) => s.name)].some((k) => params[k]) && (
          <Link href={hrefWith(path, Object.fromEntries(keep.map((k) => [k, params[k]])))} className={buttonClass("ghost", "md", "h-10")}>
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}

/* ───────────────────────────── Badges ────────────────────────────── */

type Tone = "neutral" | "positive" | "attention" | "negative" | "info" | "accent";

const TONES: Record<string, Tone> = {
  // users / businesses
  active: "positive",
  suspended: "negative",
  deleted: "neutral",
  draft: "neutral",
  closed: "neutral",
  // verification
  not_submitted: "neutral",
  pending: "attention",
  verified: "positive",
  rejected: "negative",
  needs_info: "info",
  // roles
  admin: "info",
  support: "info",
  user: "neutral",
  // reports / reviews
  open: "attention",
  resolved: "positive",
  dismissed: "neutral",
  published: "positive",
  hidden: "attention",
  removed: "negative",
  // tickets
  awaiting_customer: "info",
  // spotlight / jobs / payments
  paused: "attention",
  ended: "neutral",
  failed: "negative",
  succeeded: "positive",
  processing: "attention",
  requires_payment: "attention",
  cancelled: "neutral",
};

const LABELS: Record<string, string> = {
  not_submitted: "Not submitted",
  needs_info: "Needs info",
  awaiting_customer: "Awaiting customer",
  requires_payment: "Requires payment",
};

export function StatusBadge({ value, label, className }: { value: string; label?: string; className?: string }) {
  return (
    <Badge tone={TONES[value] ?? "neutral"} className={className} dot>
      {label ?? LABELS[value] ?? humanize(value)}
    </Badge>
  );
}

/* ───────────────────────────── Metrics ───────────────────────────── */

export function Metric({ label, value, sub, href, tone = "neutral" }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; tone?: "neutral" | "attention" | "negative" }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-3">{label}</span>
        {href && <ChevronRight className="size-4 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />}
      </div>
      <div className={cn("mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular", tone === "attention" ? "text-warn" : tone === "negative" ? "text-danger" : "text-ink")}>{value}</div>
      {sub && <div className="mt-1.5 text-[13px] text-ink-3">{sub}</div>}
    </>
  );
  const cls = "group block rounded-lg border border-line bg-surface p-4 transition-colors";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-line-strong hover:bg-surface-2/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Recent admin actions on a record (from the audit log). */
export function HistoryPanel({ items, className }: { items: { id: number; action: string; metadata: Record<string, unknown> | null; createdAt: Date; actorName: string | null }[]; className?: string }) {
  if (!items.length) return null;
  return (
    <Panel title="Admin history" description="Most recent first" className={className}>
      <ul className="divide-y divide-line">
        {items.map((h) => (
          <li key={h.id} className="flex flex-col gap-1.5 px-4 py-3 text-sm md:flex-row md:items-start md:gap-4">
            <span className="shrink-0 font-mono text-[12.5px] text-ink md:w-60">{h.action}</span>
            <div className="min-w-0 flex-1">
              <MetaChips meta={h.metadata} />
            </div>
            <span className="shrink-0 text-[13px] text-ink-3">
              {h.actorName ?? "System"} · <When at={h.createdAt} />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Compact metadata renderer for audit entries: `key: value` chips, long values truncated. */
export function MetaChips({ meta }: { meta: Record<string, unknown> | null | undefined }) {
  const entries = Object.entries(meta ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!entries.length) return <span className="text-ink-3">—</span>;
  const fmt = (v: unknown) => {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.length > 80 ? `${s.slice(0, 77)}…` : s;
  };
  const full = JSON.stringify(meta, null, 2);
  return (
    <div className="flex max-w-md flex-wrap gap-1" title={full.length < 2000 ? full : undefined}>
      {entries.slice(0, 6).map(([k, v]) => (
        <span key={k} className="inline-flex max-w-full items-baseline gap-1 rounded-sm bg-surface-2 px-1.5 py-0.5 text-[12px] leading-snug">
          <span className="shrink-0 text-ink-3">{k}</span>
          <span className="min-w-0 break-all font-mono text-[11.5px] text-ink-2">{fmt(v)}</span>
        </span>
      ))}
      {entries.length > 6 && <span className="text-[12px] text-ink-3">+{entries.length - 6} more</span>}
    </div>
  );
}
