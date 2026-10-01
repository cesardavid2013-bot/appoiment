import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CustomerThreadShell } from "@/components/messages/customer-thread-shell";
import { ThreadView } from "@/components/messages/thread-view";
import { ButtonLink } from "@/components/ui/button";
import { requestNow } from "@/server/clock";
import { appointmentRef, customerConversationWith, messageableBusiness } from "@/server/services/messaging";
import { requireViewerPage } from "@/server/viewer";

export const metadata: Metadata = { title: "New message", robots: { index: false } };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function NewMessagePage({ searchParams }: PageProps<"/messages/new">) {
  const sp = await searchParams;
  const businessId = typeof sp.business === "string" && UUID.test(sp.business) ? sp.business : null;
  const appointmentId = typeof sp.appointment === "string" && UUID.test(sp.appointment) ? sp.appointment : null;
  const back = `/messages/new?${new URLSearchParams({ ...(businessId ? { business: businessId } : {}), ...(appointmentId ? { appointment: appointmentId } : {}) })}`;
  const viewer = await requireViewerPage(back);
  if (!businessId) redirect("/messages");
  const business = await messageableBusiness(businessId);
  if (!business) notFound();

  if (business.ownerUserId === viewer.id) {
    return (
      <div className="mx-auto max-w-xl px-4 pb-16 pt-16 text-center sm:px-6">
        <h1 className="font-display text-[30px] leading-tight text-ink">This is your business</h1>
        <p className="mt-2 text-[15px] text-ink-3">Customer messages to {business.name} arrive in your business inbox.</p>
        <ButtonLink href="/pro/messages" className="mt-6">
          Open business inbox
        </ButtonLink>
      </div>
    );
  }

  const existing = await customerConversationWith(viewer, business.id);
  if (existing) redirect(`/messages/${existing}${appointmentId ? `?appointment=${appointmentId}` : ""}`);
  const attach = appointmentId ? await appointmentRef(business.id, viewer.id, appointmentId) : null;

  return (
    <CustomerThreadShell business={{ name: business.name, slug: business.slug, logo: business.logo }}>
      <ThreadView
        side="customer"
        viewerId={viewer.id}
        conversationId={null}
        endpoint="/api/messages"
        startWith={{ businessId: business.id }}
        threadHref="/messages"
        appointmentHref="/bookings/"
        initialMessages={[]}
        initialHasMore={false}
        initialOtherLastReadAt={null}
        fallbackZone={viewer.timezone ?? business.timezone}
        serverNow={requestNow()}
        attach={attach}
        placeholder={attach ? "Ask about this booking" : "Ask a question"}
        empty={
          <div className="mx-auto mb-6 max-w-sm text-center">
            <p className="text-[15px] font-semibold text-ink">{attach ? `Message ${business.name} about your booking` : `Ask ${business.name} before you book`}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-3 text-pretty">
              {attach
                ? "Running late, need to change something, or have a question? Your message goes straight to their team."
                : `Prices, timing, what to bring — ${business.name} will reply here and we'll let you know. Your phone number and email stay private.`}
            </p>
          </div>
        }
      />
    </CustomerThreadShell>
  );
}
