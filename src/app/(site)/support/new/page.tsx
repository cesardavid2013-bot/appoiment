import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TicketForm } from "@/components/support/ticket-form";
import { SUPPORT_CATEGORY_KEYS, type SupportCategory } from "@/domain/support";
import { attachableAppointments, prefillAppointment } from "@/server/services/support";
import { requireViewerPage } from "@/server/viewer";

export const metadata: Metadata = { title: "Contact support", robots: { index: false } };

export default async function NewTicketPage({ searchParams }: PageProps<"/support/new">) {
  const sp = await searchParams;
  const appointmentParam = typeof sp.appointment === "string" ? sp.appointment : undefined;
  const categoryParam = typeof sp.category === "string" ? sp.category : undefined;
  const viewer = await requireViewerPage(`/support/new${appointmentParam ? `?appointment=${encodeURIComponent(appointmentParam)}` : ""}`);
  const [list, prefill] = await Promise.all([attachableAppointments(viewer.id), prefillAppointment(viewer.id, appointmentParam)]);
  const all = prefill && !list.some((a) => a.id === prefill.id) ? [prefill, ...list] : list;
  const category = SUPPORT_CATEGORY_KEYS.includes(categoryParam as SupportCategory) ? (categoryParam as SupportCategory) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 sm:pt-10">
      <Link href="/support" className="-ms-1 mb-4 inline-flex h-10 items-center gap-1 pe-2 text-sm font-medium text-ink-3 hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden />
        Help & support
      </Link>
      <h1 className="font-display text-[32px] leading-[1.1] tracking-[-0.01em] text-ink sm:text-[38px]">Contact support</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-3 text-pretty">
        Tell us what&apos;s going on and a real person from the Kept team will reply here. For questions about a service itself, messaging the business is usually fastest.
      </p>
      {appointmentParam && !prefill && (
        <p role="alert" className="mt-5 rounded-md border border-warn/25 bg-warn-soft px-3.5 py-3 text-sm text-warn">
          We couldn&apos;t find that appointment on your account, so it hasn&apos;t been attached. You can still choose one below.
        </p>
      )}
      <div className="mt-8 rounded-xl border border-line bg-surface p-5 sm:p-6">
        <TicketForm
          appointments={all.map((a) => ({ ...a, startsAt: a.startsAt.toISOString() }))}
          initialAppointmentId={prefill?.id ?? null}
          initialCategory={category}
        />
      </div>
    </div>
  );
}
