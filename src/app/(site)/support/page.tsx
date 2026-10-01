import { ChevronDown, ChevronRight, LifeBuoy, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { categoryLabel, TICKET_STATUS_LABELS, TICKET_STATUS_TONE } from "@/domain/support";
import { listMyTickets } from "@/server/services/support";
import { requireViewerPage } from "@/server/viewer";

export const metadata: Metadata = { title: "Help & support", robots: { index: false } };

const ANSWERS: { q: string; a: ReactNode }[] = [
  {
    q: "How do I cancel or reschedule an appointment?",
    a: (
      <>
        Open <Link href="/bookings" className="font-medium text-ink underline underline-offset-4">Bookings</Link>, choose the appointment and tap Reschedule or Cancel. Each business sets its own cancellation window — you&apos;ll see exactly what applies, including any fee or refund, before you confirm.
      </>
    ),
  },
  {
    q: "When will I get my refund?",
    a: "Refunds go back to the card you paid with as soon as a cancellation is confirmed. Depending on your bank, they usually take 5–10 business days to appear. Whether a deposit is refundable depends on the business's policy, which is shown when you book.",
  },
  {
    q: "How do I contact a professional?",
    a: (
      <>
        Use Message on their profile or on your booking. Your conversations live in <Link href="/messages" className="font-medium text-ink underline underline-offset-4">Messages</Link>. For anything about the service itself — directions, preparation, what to bring — the business can answer fastest.
      </>
    ),
  },
  {
    q: "Something went wrong with a business. What can I do?",
    a: "Open a request below and choose “Report a business”. Link the appointment if there is one. We read every report, and we can step in on refunds and, where needed, remove businesses from Kept.",
  },
  {
    q: "How do I change my email or delete my account?",
    a: (
      <>
        Email changes go through support so we can confirm it&apos;s you. You can download your data or delete your account yourself in{" "}
        <Link href="/account/privacy" className="font-medium text-ink underline underline-offset-4">Privacy &amp; data</Link>.
      </>
    ),
  },
];

const fmt = (d: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);

export default async function SupportPage({ searchParams }: PageProps<"/support">) {
  const sp = await searchParams;
  if (typeof sp.appointment === "string") redirect(`/support/new?appointment=${encodeURIComponent(sp.appointment)}`);
  const viewer = await requireViewerPage("/support");
  const tickets = await listMyTickets(viewer.id);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <PageHeader
        title="Help & support"
        description="Get help with a booking, a payment or your account."
        actions={
          tickets.length > 0 ? (
            <ButtonLink href="/support/new" icon={<Plus className="size-4" />} className="h-11 sm:h-10">
              New request
            </ButtonLink>
          ) : undefined
        }
      />

      <section aria-labelledby="requests-h" className="mt-10">
        <h2 id="requests-h" className="mb-3 text-lg font-semibold tracking-[-0.01em] text-ink">
          Your requests
        </h2>
        {tickets.length === 0 ? (
          <EmptyState
            className="rounded-xl border border-dashed border-line-strong"
            icon={<LifeBuoy />}
            title="No requests yet"
            description="If something isn't right with a booking, a payment or your account, tell us and we'll help sort it out."
            action={
              <ButtonLink href="/support/new" icon={<Plus className="size-4" />}>
                Contact support
              </ButtonLink>
            }
          />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/support/${t.id}`} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-surface-2/60 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-ink">{t.subject}</p>
                    <p className="mt-0.5 truncate text-[13px] text-ink-3">
                      {categoryLabel(t.category)} · Updated {fmt(t.lastActivityAt)} · {t.messageCount} {t.messageCount === 1 ? "message" : "messages"}
                    </p>
                  </div>
                  <Badge tone={TICKET_STATUS_TONE[t.status]} className="shrink-0">
                    {TICKET_STATUS_LABELS[t.status]}
                  </Badge>
                  <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="answers-h" className="mt-12">
        <h2 id="answers-h" className="mb-3 text-lg font-semibold tracking-[-0.01em] text-ink">
          Quick answers
        </h2>
        <div className="divide-y divide-line border-y border-line">
          {ANSWERS.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[15px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="pb-5 pr-8 text-[15px] leading-relaxed text-ink-2">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-sm text-ink-3">
          Still stuck?{" "}
          <Link href="/support/new" className="font-medium text-ink underline underline-offset-4">
            Contact support
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
