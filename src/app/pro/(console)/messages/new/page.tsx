import { Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProThreadFrame } from "@/components/messages/pro-thread-frame";
import { ThreadView } from "@/components/messages/thread-view";
import { ButtonLink } from "@/components/ui/button";
import { AppError } from "@/domain/errors";
import { db } from "@/server/db/client";
import { businessCustomers } from "@/server/db/schema";
import { requestNow } from "@/server/clock";
import { conversationForClient } from "@/server/services/messaging";
import { proPage } from "@/server/pro-page";
import { eq } from "drizzle-orm";

export const metadata: Metadata = { title: "New message" };

export default async function NewProMessagePage({ searchParams }: PageProps<"/pro/messages/new">) {
  const { viewer, m } = await proPage("messages.manage");
  const sp = await searchParams;
  const customerId = typeof sp.customer === "string" && /^[0-9a-f-]{36}$/i.test(sp.customer) ? sp.customer : null;
  if (!customerId) redirect("/pro/messages");
  let found;
  try {
    found = await conversationForClient(m, customerId);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
  if (found.conversationId) redirect(`/pro/messages/${found.conversationId}`);
  const client = found.client;

  if (!client.userId) {
    // Contact details only for people allowed to see them.
    const [contact] = m.permissions.has("customers.view") ? await db.select({ phone: businessCustomers.phone, email: businessCustomers.email }).from(businessCustomers).where(eq(businessCustomers.id, client.id)) : [];
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-[15px] font-semibold text-ink">{client.name} can&apos;t receive messages</p>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-3">They were added by your team and don&apos;t have a Kept account. Reach them directly instead.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {contact?.phone && (
            <ButtonLink href={`tel:${contact.phone}`} variant="secondary" icon={<Phone className="size-4" />}>
              Call {contact.phone}
            </ButtonLink>
          )}
          {contact?.email && (
            <ButtonLink href={`mailto:${contact.email}`} variant="secondary" icon={<Mail className="size-4" />}>
              Email
            </ButtonLink>
          )}
          <ButtonLink href="/pro/messages" variant="ghost">
            Back to inbox
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <ProThreadFrame name={client.name} avatar={null} subtitle="New conversation">
      <ThreadView
        side="business"
        viewerId={viewer.id}
        conversationId={null}
        endpoint="/api/pro/messages"
        startWith={{ customerId: client.id }}
        threadHref="/pro/messages"
        appointmentHref="/pro/appointments/"
        initialMessages={[]}
        initialHasMore={false}
        initialOtherLastReadAt={null}
        uploadBusinessId={m.businessId}
        fallbackZone={viewer.timezone ?? m.timezone}
        serverNow={requestNow()}
        placeholder={`Message ${client.name.split(" ")[0]}`}
        empty={
          <div className="mx-auto mb-6 max-w-sm text-center">
            <p className="text-[15px] font-semibold text-ink">Start a conversation with {client.name}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-3">They&apos;ll get a notification and can reply from their Kept inbox.</p>
          </div>
        }
      />
    </ProThreadFrame>
  );
}
