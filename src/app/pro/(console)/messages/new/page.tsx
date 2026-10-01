import { Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProThreadFrame } from "@/components/messages/pro-thread-frame";
import { ThreadView } from "@/components/messages/thread-view";
import { ButtonLink } from "@/components/ui/button";
import { AppError } from "@/domain/errors";
import { getT } from "@/i18n/server";
import { db } from "@/server/db/client";
import { businessCustomers } from "@/server/db/schema";
import { requestNow } from "@/server/clock";
import { conversationForClient } from "@/server/services/messaging";
import { proPage } from "@/server/pro-page";
import { eq } from "drizzle-orm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("pro");
  return { title: t("inbox.newMessage") };
}

export default async function NewProMessagePage({ searchParams }: PageProps<"/pro/messages/new">) {
  const { viewer, m } = await proPage("messages.manage");
  const t = await getT("pro");
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
        <p className="text-[15px] font-semibold text-ink">{t("inbox.cantReceive", { name: client.name })}</p>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-3">{t("inbox.cantReceiveBody")}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {contact?.phone && (
            <ButtonLink href={`tel:${contact.phone}`} variant="secondary" icon={<Phone className="size-4" />}>
              {t("inbox.call", { phone: contact.phone })}
            </ButtonLink>
          )}
          {contact?.email && (
            <ButtonLink href={`mailto:${contact.email}`} variant="secondary" icon={<Mail className="size-4" />}>
              {t("inbox.email")}
            </ButtonLink>
          )}
          <ButtonLink href="/pro/messages" variant="ghost">
            {t("inbox.back")}
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <ProThreadFrame name={client.name} avatar={null} subtitle={t("inbox.newConversation")}>
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
        placeholder={t("inbox.messageTo", { name: client.name.split(" ")[0] })}
        empty={
          <div className="mx-auto mb-6 max-w-sm text-center">
            <p className="text-[15px] font-semibold text-ink">{t("inbox.startWith", { name: client.name })}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{t("inbox.startBody")}</p>
          </div>
        }
      />
    </ProThreadFrame>
  );
}
