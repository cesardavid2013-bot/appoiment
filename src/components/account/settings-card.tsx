import type { ReactNode } from "react";

/** A titled group of settings rendered as a quiet card. */
export function SettingsCard({ title, description, children, footer, id }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-line bg-surface">
      <div className="px-5 pt-5 sm:px-6">
        <h2 id={id} className="text-base font-semibold text-ink">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-ink-3 text-pretty">{description}</p>}
      </div>
      <div className="px-5 pb-5 pt-4 sm:px-6">{children}</div>
      {footer && <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end sm:px-6">{footer}</div>}
    </section>
  );
}
