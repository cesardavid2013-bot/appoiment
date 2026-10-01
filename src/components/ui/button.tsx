import Link from "next/link";
import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "accent" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const base =
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:bg-ink/88 shadow-sm",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2 hover:border-ink-3/40",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
  accent: "bg-accent text-accent-ink hover:bg-accent/90 shadow-sm",
  danger: "bg-surface text-danger border border-line-strong hover:bg-danger-soft hover:border-danger/30",
  subtle: "bg-surface-2 text-ink hover:bg-surface-3",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-md",
  md: "h-10 px-4 text-sm rounded-md",
  lg: "h-12 px-5 text-[15px] rounded-lg",
  icon: "size-10 rounded-md",
  "icon-sm": "size-8 rounded-md",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});

type LinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function ButtonLink({ variant = "primary", size = "md", icon, className, children, ...props }: LinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
