import Link from "next/link";
import type { ReactNode } from "react";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { rich, type RichTags } from "@/i18n/rich";
import { getI18n, getMessages, getT } from "@/i18n/server";
import type { Messages } from "@/i18n/translate";

export type LegalDocKey = "terms" | "privacy";

/** Links a legal message may contain, by tag name: `<support>contact us</support>`. */
function link(href: string) {
  return function LegalLink(c: ReactNode) {
    return <Link href={href}>{c}</Link>;
  };
}
const TAGS: RichTags = {
  b: (c) => <strong>{c}</strong>,
  support: link("/support/new?category=other"),
  supportPayment: link("/support/new?category=payment"),
  supportAccount: link("/support/new?category=account"),
  pricing: link("/for-business#pricing"),
  privacyData: link("/account/privacy"),
  profile: link("/account/profile"),
  notifications: link("/account/notifications"),
};

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const keysOf = (m: Messages | string | undefined) => (m && typeof m === "object" ? Object.keys(m) : []);

type Block = { kind: "p"; key: string } | { kind: "ul"; keys: string[] };

/**
 * A section body's shape comes from the English messages, in order: `pN` keys are
 * paragraphs and consecutive `liN` keys form one bulleted list. Other languages
 * translate the same keys, so they can't drift out of structure.
 */
function blocksOf(body: Messages | string | undefined): Block[] {
  const out: Block[] = [];
  for (const key of keysOf(body)) {
    const last = out.at(-1);
    if (key.startsWith("li")) {
      if (last?.kind === "ul") last.keys.push(key);
      else out.push({ kind: "ul", keys: [key] });
    } else out.push({ kind: "p", key });
  }
  return out;
}

/** Long-form legal typography: comfortable measure, numbered sections, anchor links. */
export async function LegalDoc({ doc, updated }: { doc: LegalDocKey; updated: string }) {
  const [t, en, { intl }] = await Promise.all([getT("legal"), getMessages(DEFAULT_LOCALE), getI18n()]);
  const source = ((en.legal as Messages)[doc] as Messages).sections as Messages;
  const sections = keysOf(source).map((key) => {
    const base = `${doc}.sections.${key}`;
    return { id: kebab(key), base, title: t(`${base}.title`), blocks: blocksOf((source[key] as Messages).body) };
  });
  const date = new Intl.DateTimeFormat(intl, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${updated}T12:00:00Z`));

  return (
    <article className="mt-10">
      <header className="max-w-[68ch]">
        <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.01em] text-ink sm:text-5xl">{t(`${doc}.title`)}</h1>
        <p className="mt-3 text-sm text-ink-3">
          <time dateTime={updated}>{t("doc.lastUpdated", { date })}</time>
        </p>
        <p className="mt-1 text-sm text-ink-3">{t("governingVersion")}</p>
        <p className="mt-5 rounded-md border border-line bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">{t("doc.counselNote")}</p>
        <div className="mt-6 space-y-4 text-[16px] leading-[1.75] text-ink-2 [&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4">
          <p>{rich(t(`${doc}.intro`), TAGS)}</p>
        </div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[220px_minmax(0,68ch)] lg:gap-14">
        <nav aria-label={t("doc.contents")} className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-[13px] font-medium text-ink-3">{t("doc.contents")}</p>
          <ol className="space-y-1 text-sm">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex min-h-9 items-baseline gap-2 py-1 text-ink-2 hover:text-ink">
                  <span className="w-5 shrink-0 text-ink-3 tabular">{new Intl.NumberFormat(intl).format(i + 1)}.</span>
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
                <span className="me-2 text-ink-3 tabular">{new Intl.NumberFormat(intl).format(i + 1)}.</span>
                {s.title}
              </h2>
              <div className="mt-4 space-y-4 text-[16px] leading-[1.75] text-ink-2 [&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_li]:ps-1 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:ps-5">
                {s.blocks.map((b) =>
                  b.kind === "p" ? (
                    <p key={b.key}>{rich(t(`${s.base}.body.${b.key}`), TAGS)}</p>
                  ) : (
                    <ul key={b.keys[0]}>
                      {b.keys.map((k) => (
                        <li key={k}>{rich(t(`${s.base}.body.${k}`), TAGS)}</li>
                      ))}
                    </ul>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}

/** Title and description for a legal page's metadata, in the visitor's language. */
export async function legalMetadata(doc: LegalDocKey) {
  const t = await getT("legal");
  return { title: t(`${doc}.meta.title`), description: t(`${doc}.meta.description`), alternates: { canonical: `/legal/${doc}` } };
}
