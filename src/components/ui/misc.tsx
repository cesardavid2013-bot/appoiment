import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { StarsLabel } from "./stars-label";

export function Card({ className, children, as: As = "div" }: { className?: string; children: ReactNode; as?: "div" | "section" | "article" | "li" }) {
  return <As className={cn("rounded-lg border border-line bg-surface", className)}>{children}</As>;
}

type Tone = "neutral" | "positive" | "attention" | "negative" | "info" | "accent";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  positive: "bg-accent-soft text-accent-text",
  accent: "bg-accent-soft text-accent-text",
  attention: "bg-warn-soft text-warn",
  negative: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Badge({ tone = "neutral", className, children, dot }: { tone?: Tone; className?: string; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-5">{icon}</div>}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-3 text-pretty">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[13px] font-medium text-ink-3">{eyebrow}</div>}
        <h1 className="font-display text-[32px] leading-[1.1] tracking-[-0.01em] text-ink sm:text-[38px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-3 text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, action, className, id }: { children: ReactNode; action?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("mb-4 flex items-end justify-between gap-4", className)}>
      <h2 id={id} className="text-lg font-semibold tracking-[-0.01em] text-ink">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line", className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-3">{children}</kbd>;
}

const STAR = "M10 1.5l2.6 5.5 6 .7-4.5 4.1 1.2 5.9L10 14.8 4.7 17.7l1.2-5.9L1.4 7.7l6-.7L10 1.5z";

export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (Math.round(value * 2) / 2 / 5) * 100));
  const row = (cls: string) => (
    <span className={cn("flex gap-0.5", cls)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 20 20" aria-hidden className="shrink-0">
          <path d={STAR} fill="currentColor" />
        </svg>
      ))}
    </span>
  );
  return (
    <span className={cn("relative inline-flex text-ink", className)}>
      <span aria-hidden className="contents">
        {row("opacity-20")}
        <span className="absolute inset-y-0 start-0 overflow-hidden" style={{ width: `${pct}%` }}>
          {row("")}
        </span>
      </span>
      <StarsLabel value={value} />
    </span>
  );
}

/** `labels` lets callers pass translated text; English is the default. */
export function RatingInline({ avg, count, className, labels }: { avg: number | null; count: number; className?: string; labels?: { new: string; summary: string } }) {
  if (!avg || count === 0) return <span className={cn("text-[13px] text-ink-3", className)}>{labels?.new ?? "New"}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[13px] text-ink", className)}>
      <svg width="13" height="13" viewBox="0 0 20 20" aria-hidden className="text-ink">
        <path d={STAR} fill="currentColor" />
      </svg>
      <span className="font-semibold tabular">{avg.toFixed(1)}</span>
      <span className="text-ink-3 tabular">({count})</span>
      <span className="sr-only">{labels?.summary ?? `rated ${avg.toFixed(1)} from ${count} reviews`}</span>
    </span>
  );
}
