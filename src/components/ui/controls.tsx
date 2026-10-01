"use client";

import { Checkbox as C, Switch as S, Tabs as T } from "radix-ui";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Switch({ checked, onCheckedChange, label, description, disabled, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; id?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start justify-between gap-4 py-1", disabled && "cursor-not-allowed opacity-60")}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{description}</span>}
      </span>
      <S.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-line-strong transition-colors data-[state=checked]:bg-accent"
      >
        <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-[18px]" />
      </S.Root>
    </label>
  );
}

export function Checkbox({ checked, onCheckedChange, label, description, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 py-1", disabled && "cursor-not-allowed opacity-60")}>
      <C.Root
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[5px] border border-line-strong bg-surface transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent"
      >
        <C.Indicator>
          <Check className="size-3.5 text-accent-ink" strokeWidth={3} />
        </C.Indicator>
      </C.Root>
      <span className="min-w-0 text-sm leading-snug">
        <span className="text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-ink-3">{description}</span>}
      </span>
    </label>
  );
}

/** Pill-free segmented control for small option sets (view switches, filters). */
export function Segmented<T extends string>({ value, onChange, options, label, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[7px] font-medium transition-colors",
            size === "sm" ? "h-7 px-2.5 text-[13px]" : "h-8 px-3 text-sm",
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Tabs = T.Root;
export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return <T.List className={cn("flex gap-6 overflow-x-auto border-b border-line scrollbar-none", className)}>{children}</T.List>;
}
export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <T.Trigger
      value={value}
      className="relative -mb-px h-11 shrink-0 border-b-2 border-transparent text-sm font-medium text-ink-3 transition-colors hover:text-ink data-[state=active]:border-ink data-[state=active]:text-ink"
    >
      {children}
    </T.Trigger>
  );
}
export const TabsContent = T.Content;

/** Selectable card used for options/choices (radio or checkbox semantics). */
export function ChoiceCard({
  selected,
  onClick,
  title,
  description,
  aside,
  disabled,
  role = "radio",
}: {
  selected: boolean;
  onClick: () => void;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  disabled?: boolean;
  role?: "radio" | "checkbox";
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-4 py-3.5 text-left transition-[border-color,background-color,box-shadow]",
        selected ? "border-ink bg-surface shadow-[0_0_0_1px_var(--ink)]" : "border-line bg-surface hover:border-line-strong",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-[18px] shrink-0 items-center justify-center border transition-colors",
          role === "radio" ? "rounded-full" : "rounded-[5px]",
          selected ? "border-ink bg-ink" : "border-line-strong",
        )}
        aria-hidden
      >
        {selected && (role === "radio" ? <span className="size-1.5 rounded-full bg-bg" /> : <Check className="size-3 text-bg" strokeWidth={3} />)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-ink">{title}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{description}</span>}
      </span>
      {aside && <span className="shrink-0 text-right text-sm text-ink-2 tabular">{aside}</span>}
    </button>
  );
}
