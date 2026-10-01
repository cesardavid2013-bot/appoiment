import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { conversationForClient } from "@/server/services/messaging";
import { proPage } from "@/server/pro-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("pro");
  return { title: t("nav.inbox") };
}

export default async function InboxPage({ searchParams }: PageProps<"/pro/messages">) {
  const { m } = await proPage("messages.manage");
  const t = await getT("pro");
  const sp = await searchParams;
  // "Message" buttons elsewhere link here with ?customer=<client id>.
  if (typeof sp.customer === "string" && /^[0-9a-f-]{36}$/i.test(sp.customer)) {
    const found = await conversationForClient(m, sp.customer).catch(() => null);
    if (found?.conversationId) redirect(`/pro/messages/${found.conversationId}`);
    if (found) redirect(`/pro/messages/new?customer=${sp.customer}`);
  }
  // Phones show only the list (from the layout); desktop shows this beside it.
  return (
    <div className="hidden h-full flex-col items-center justify-center px-8 text-center lg:flex">
      <MessageCircle className="size-6 text-ink-3" aria-hidden />
      <p className="mt-3 text-[15px] font-semibold text-ink">{t("inbox.pickTitle")}</p>
      <p className="mt-1 max-w-xs text-sm leading-relaxed text-ink-3">{t("inbox.pickBody")}</p>
    </div>
  );
}
