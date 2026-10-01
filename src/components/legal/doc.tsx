import type { ReactNode } from "react";

/** Long-form legal typography: comfortable measure, numbered sections, anchor links. */
export function LegalDoc({ title, updated, intro, sections }: { title: string; updated: string; intro: ReactNode; sections: { id: string; title: string; body: ReactNode }[] }) {
  return (
    <article className="mt-10">
      <header className="max-w-[68ch]">
        <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.01em] text-ink sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-ink-3">Last updated {updated}</p>
        <p className="mt-5 rounded-md border border-line bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          This is a plain-language starter document. It will be reviewed by legal counsel before Kept launches publicly, and may change as a result. We&apos;ll tell you before any change that affects your rights takes effect.
        </p>
        <div className="mt-6 space-y-4 text-[16px] leading-[1.75] text-ink-2">{intro}</div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[220px_minmax(0,68ch)] lg:gap-14">
        <nav aria-label="Contents" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-[13px] font-medium text-ink-3">Contents</p>
          <ol className="space-y-1 text-sm">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex min-h-9 items-baseline gap-2 py-1 text-ink-2 hover:text-ink">
                  <span className="w-5 shrink-0 text-ink-3 tabular">{i + 1}.</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="min-w-0 space-y-12">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-24">
              <h2 id={`${s.id}-h`} className="text-xl font-semibold tracking-[-0.01em] text-ink">
                <span className="mr-2 text-ink-3 tabular">{i + 1}.</span>
                {s.title}
              </h2>
              <div className="mt-4 space-y-4 text-[16px] leading-[1.75] text-ink-2 [&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                {s.body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
