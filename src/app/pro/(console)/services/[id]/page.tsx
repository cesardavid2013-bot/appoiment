import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ServiceEditor } from "@/components/pro/service-editor";
import { ArchivedServiceNotice } from "@/components/pro/services-list";
import { AppError } from "@/domain/errors";
import { getT } from "@/i18n/server";
import { proPage } from "@/server/pro-page";
import { getServiceForEdit } from "@/server/services/catalog-admin";
import { coverFor, serviceEditorContext } from "@/server/services/service-editor-data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSetup");
  return { title: t("services.edit") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditServicePage({ params }: PageProps<"/pro/services/[id]">) {
  const { m } = await proPage("services.manage");
  const { id } = await params;
  const t = await getT("proSetup");
  if (!UUID.test(id)) notFound();
  const svc = await getServiceForEdit(m.businessId, id).catch((err) => {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  });
  const ctx = await serviceEditorContext(m);
  const { id: _id, slug, archived, ...initial } = svc;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 lg:px-10 lg:pt-10">
      <Link href="/pro/services" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> {t("services.title")}
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{svc.name}</h1>
        {m.businessStatus === "active" && svc.status === "active" && !archived && (
          <Link href={`/${m.businessSlug}/book?service=${svc.id}`} target="_blank" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
            {t("services.openBookingPage")} <ExternalLink className="size-3.5" />
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-3 tabular">/{m.businessSlug} · {slug}</p>
      <div className="mt-8">
        {archived ? <ArchivedServiceNotice id={svc.id} /> : <ServiceEditor initial={initial} serviceId={svc.id} ctx={ctx} cover={await coverFor(svc.coverMediaId)} />}
      </div>
    </div>
  );
}
