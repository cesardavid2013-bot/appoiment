import { ChevronDown, ChevronRight, LifeBuoy, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { rich } from "@/i18n/rich";
import { TICKET_STATUS_TONE } from "@/domain/support";
import { getI18n, getT } from "@/i18n/server";
import { categoryKey } from "@/components/support/category";
import { listMyTickets } from "@/server/services/support";
import { requireViewerPage } from "@/server/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("support");
  return { title: t("home.title"), robots: { index: false } };
}

function link(href: string) {
  return function InlineLink(text: ReactNode) {
    return (
      <Link href={href} className="font-medium text-ink underline underline-offset-4">
        {text}
      </Link>
    );
  };
}

/** Quick answers; `links` turns <link>…</link> in the answer into an in-app link. */
const ANSWERS: { key: string; links?: Record<string, (text: ReactNode) => ReactNode> }[] = [
  { key: "reschedule", links: { link: link("/bookings") } },
  { key: "refund" },
  { key: "contactPro", links: { link: link("/messages") } },
  { key: "report" },
  { key: "account", links: { link: link("/account/privacy") } },
];

export default async function SupportPage({ searchParams }: PageProps<"/support">) {
  const sp = await searchParams;
  if (typeof sp.appointment === "string") redirect(`/support/new?appointment=${encodeURIComponent(sp.appointment)}`);
  const viewer = await requireViewerPage("/support");
  const [tickets, t, { intl }] = await Promise.all([listMyTickets(viewer.id), getT("support"), getI18n()]);
  const fmt = (d: Date) => new Intl.DateTimeFormat(intl, { month: "short", day: "numeric", year: "numeric" }).format(d);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <PageHeader
        title={t("home.title")}
        description={t("home.description")}
        actions={
          tickets.length > 0 ? (
            <ButtonLink href="/support/new" icon={<Plus className="size-4" />} className="h-11 sm:h-10">
              {t("home.newRequest")}
            </ButtonLink>
          ) : undefined
        }
      />

      <section aria-labelledby="requests-h" className="mt-10">
        <h2 id="requests-h" className="mb-3 text-lg font-semibold tracking-[-0.01em] text-ink">
          {t("home.yourRequests")}
        </h2>
        {tickets.length === 0 ? (
          <EmptyState
            className="rounded-xl border border-dashed border-line-strong"
            icon={<LifeBuoy />}
            title={t("home.emptyTitle")}
            description={t("home.emptyBody")}
            action={
              <ButtonLink href="/support/new" icon={<Plus className="size-4" />}>
                {t("home.contact")}
              </ButtonLink>
            }
          />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link href={`/support/${ticket.id}`} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-surface-2/60 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-ink">{ticket.subject}</p>
                    <p className="mt-0.5 truncate text-[13px] text-ink-3">
                      {t("home.ticketLine", { category: t(`categories.${categoryKey(ticket.category)}.label`), date: fmt(ticket.lastActivityAt), count: ticket.messageCount })}
                    </p>
                  </div>
                  <Badge tone={TICKET_STATUS_TONE[ticket.status]} className="shrink-0">
                    {t(`status.${ticket.status}`)}
                  </Badge>
                  <ChevronRight className="size-4 shrink-0 text-ink-3 rtl:-scale-x-100" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="answers-h" className="mt-12">
        <h2 id="answers-h" className="mb-3 text-lg font-semibold tracking-[-0.01em] text-ink">
          {t("home.quickAnswers")}
        </h2>
        <div className="divide-y divide-line border-y border-line">
          {ANSWERS.map((item) => (
            <details key={item.key} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[15px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                {t(`faq.${item.key}.q`)}
                <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="pb-5 pe-8 text-[15px] leading-relaxed text-ink-2">{rich(t(`faq.${item.key}.a`), item.links ?? {})}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-sm text-ink-3">
          {rich(t("home.stillStuck"), { link: link("/support/new") })}
        </p>
      </section>
    </div>
  );
}
