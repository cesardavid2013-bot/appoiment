import { forwardRef, useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border border-line-strong bg-surface px-3 text-ink placeholder:text-ink-3 transition-colors hover:border-ink-3/50 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:bg-surface-2 disabled:text-ink-3 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, "h-11 md:h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(function Textarea({ className, rows = 4, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(control, "py-2.5 leading-relaxed resize-y min-h-20", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, ComponentProps<"select">>(function Select({ className, children, ...props }, ref) {
  return (
    <div className={cn("relative", /\bw-(?!full)/.test(className ?? "") && "w-fit")}>
      <select ref={ref} className={cn(control, "h-11 md:h-10 appearance-none pe-9 cursor-pointer", className)} {...props}>
        {children}
      </select>
      <svg className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
});

type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode;
};

/** Label + control + hint/error, wired for screen readers. */
export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-medium text-ink">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-ink-3">Optional</span>}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[13px] leading-snug text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[13px] leading-snug text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger">
      {message}
    </div>
  );
}
