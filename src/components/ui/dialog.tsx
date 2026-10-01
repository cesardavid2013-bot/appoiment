"use client";

import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Prevent closing via overlay/escape (e.g. while a critical write is in flight). */
  locked?: boolean;
};

/**
 * Modal that renders as a centered dialog on larger screens and a bottom
 * sheet on phones — with focus trap, escape handling and scroll locking.
 */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = "md", locked }: Props) {
  return (
    <D.Root open={open} onOpenChange={(o) => (!locked || o ? onOpenChange(o) : undefined)}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
        <D.Content
          onEscapeKeyDown={(e) => locked && e.preventDefault()}
          onPointerDownOutside={(e) => locked && e.preventDefault()}
          className={cn(
            "fixed z-50 flex max-h-[92dvh] flex-col bg-surface shadow-lg outline-none",
            "inset-x-0 bottom-0 rounded-t-xl data-[state=open]:animate-sheet",
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:data-[state=open]:animate-rise",
            size === "sm" && "sm:max-w-md",
            size === "md" && "sm:max-w-lg",
            size === "lg" && "sm:max-w-2xl",
          )}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4 sm:px-6 sm:pt-5">
            <div className="min-w-0">
              <D.Title className="text-lg font-semibold tracking-[-0.01em] text-ink">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm leading-relaxed text-ink-3">{description}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</D.Description>}
            </div>
            {!locked && (
              <D.Close className="-mr-2 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
                <X className="size-5" />
              </D.Close>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 safe-bottom sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Confirmation for destructive or consequential actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading,
  tone = "danger",
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  tone?: "danger" | "primary";
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      locked={loading}
      footer={
        <>
          <button className="h-10 rounded-md px-4 text-sm font-medium text-ink-2 hover:bg-surface-2" onClick={() => onOpenChange(false)} disabled={loading}>
            Keep it
          </button>
          <button
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium disabled:opacity-60",
              tone === "danger" ? "bg-danger text-white hover:bg-danger/90" : "bg-ink text-bg hover:bg-ink/90",
            )}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
