import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ServiceEditor, type EditorInput } from "@/components/pro/service-editor";
import { AppError } from "@/domain/errors";
import { getT } from "@/i18n/server";
import { proPage } from "@/server/pro-page";
import { getServiceForEdit } from "@/server/services/catalog-admin";
import { coverFor, serviceEditorContext } from "@/server/services/service-editor-data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSetup");
  return { title: t("services.new") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewServicePage({ searchParams }: PageProps<"/pro/services/new">) {
  const { m } = await proPage("services.manage");
  const t = await getT("proSetup");
  const { copy } = await searchParams;
  const ctx = await serviceEditorContext(m);

  let initial: EditorInput = {
    name: "",
    description: null,
    categoryId: null,
    menuSection: null,
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    priceType: "fixed",
    priceCents: 0,
    salePriceCents: null,
    priceMaxCents: null,
    paymentPolicy: "pay_later",
    depositType: null,
    depositValue: null,
    capacity: 1,
    minAttendees: 1,
    minNoticeMinutes: null,
    maxAdvanceDays: null,
    requiresApproval: null,
    intakeFormId: null,
    consentText: null,
    minAge: null,
    bookingInstructions: null,
    coverMediaId: null,
    status: "active",
    memberIds: ctx.team.length === 1 || m.businessKind === "individual" ? ctx.team.map((t) => t.id) : ctx.team.filter((t) => t.id === m.memberId).map((t) => t.id),
    staffOverrides: [],
    locationIds: [],
    optionGroups: [],
  };
  let copiedFrom: string | null = null;
  if (typeof copy === "string" && UUID.test(copy)) {
    try {
      const src = await getServiceForEdit(m.businessId, copy);
      copiedFrom = src.name;
      // Strip ids so the copy creates new option rows instead of stealing the original's.
      const { id: _id, slug: _slug, archived: _archived, ...rest } = src;
      initial = {
        ...rest,
        name: t("services.copyName", { name: src.name }).slice(0, 100),
        status: "hidden",
        optionGroups: src.optionGroups.map(({ id: _g, ...g }) => ({ ...g, options: g.options.map(({ id: _o, ...o }) => o) })),
      };
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 lg:px-10 lg:pt-10">
      <Link href="/pro/services" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> {t("services.title")}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-ink">{copiedFrom ? t("services.duplicateTitle", { name: copiedFrom }) : t("services.new")}</h1>
      {copiedFrom && <p className="mt-1 text-sm text-ink-3">{t("services.duplicateHint")}</p>}
      <div className="mt-8">
        <ServiceEditor initial={initial} serviceId={null} ctx={ctx} cover={await coverFor(initial.coverMediaId)} />
      </div>
    </div>
  );
}
