import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { SettingsCard, SettingsShell } from "@/components/pro/settings-shell";
import { ButtonLink } from "@/components/ui/button";
import { entitlements } from "@/domain/plans";
import { rich } from "@/i18n/rich";
import { getI18n, getT } from "@/i18n/server";
import type { TFunction } from "@/i18n/translate";
import { fmtDate } from "@/lib/format";
import { requestNow } from "@/server/clock";
import { proPage } from "@/server/pro-page";
import { listFormsWithUsage, type FormUsage } from "@/server/services/forms-admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSettings");
  return { title: t("forms.title") };
}

export default async function FormsSettingsPage() {
  const { m } = await proPage("services.manage");
  const perms = [...m.permissions];
  const allowed = entitlements(m.plan).intakeForms;
  const [forms, t, { intl }] = await Promise.all([allowed ? listFormsWithUsage(m.businessId) : Promise.resolve([]), getT("proSettings"), getI18n()]);
  const now = requestNow();

  if (!allowed)
    return (
      <SettingsShell title={t("forms.title")} perms={perms}>
        <SettingsCard id="forms-plan" title={t("forms.notIncludedTitle")}>
          <p className="text-sm leading-relaxed text-ink-2">{t("forms.notIncludedBody", { plan: entitlements(m.plan).label })}</p>
        </SettingsCard>
      </SettingsShell>
    );

  return (
    <SettingsShell
      title={t("forms.title")}
      description={t("forms.description")}
      perms={perms}
      actions={
        forms.length > 0 ? (
          <ButtonLink href="/pro/settings/forms/new" icon={<Plus className="size-4" />}>
            {t("forms.newForm")}
          </ButtonLink>
        ) : undefined
      }
    >
      {forms.length === 0 ? (
        <section className="rounded-xl border border-line bg-surface px-5 py-8 sm:px-8">
          <h2 className="text-base font-semibold text-ink">{t("forms.emptyTitle")}</h2>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-3 text-pretty">{t("forms.emptyBody")}</p>
          <ButtonLink href="/pro/settings/forms/new" icon={<Plus className="size-4" />} className="mt-5">
            {t("forms.create")}
          </ButtonLink>
        </section>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface" aria-label={t("forms.listLabel")}>
          {forms.map((f) => {
            const required = f.fields.filter((x) => x.required).length;
            const edited = new Date(f.updatedAt);
            const sameYear = fmtDate(edited, m.timezone, { year: "numeric" }) === fmtDate(new Date(now), m.timezone, { year: "numeric" });
            const editedOn = t("forms.edited", { date: fmtDate(edited, m.timezone, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }, intl) });
            return (
              <li key={f.id} className="relative flex items-start gap-4 px-4 py-4 hover:bg-surface-2/50 sm:px-5">
                <div className="min-w-0 flex-1">
                  <Link href={`/pro/settings/forms/${f.id}`} className="text-[15px] font-medium text-ink after:absolute after:inset-0 after:content-['']">
                    {f.name}
                  </Link>
                  <p className="mt-0.5 text-[13px] text-ink-3 tabular">
                    {f.fields.length === 0 ? t("forms.noQuestions") : [t("forms.questions", { count: f.fields.length }), required ? t("forms.required", { count: required }) : null].filter(Boolean).join(" · ")}
                    <span className="sm:hidden"> · {editedOn}</span>
                  </p>
                  <UsedBy services={f.services} t={t} intl={intl} />
                </div>
                <p className="hidden shrink-0 pt-0.5 text-end text-[13px] text-ink-3 tabular sm:block">{editedOn}</p>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[13px] leading-relaxed text-ink-3">{rich(t("forms.footer"), { b: (c) => <span className="font-medium text-ink-2">{c}</span> })}</p>
    </SettingsShell>
  );
}

function UsedBy({ services, t, intl }: { services: FormUsage[]; t: TFunction; intl: string }) {
  if (!services.length) return <p className="mt-1.5 text-[13px] text-ink-3">{t("forms.notUsed")}</p>;
  const shown = services.slice(0, 3);
  const extra = services.length - shown.length;
  // Join the names the way the viewer's language does ("A, B and 2 more"), keeping each name a link.
  const items = [...shown.map((s) => s.id), ...(extra > 0 ? ["more"] : [])];
  const parts = new Intl.ListFormat(intl, { type: "conjunction" }).formatToParts(items);
  const list = parts.map((p, i) => {
    if (p.type === "literal") return <Fragment key={i}>{p.value}</Fragment>;
    const s = shown.find((x) => x.id === p.value);
    if (!s) return <Fragment key={i}>{t("forms.more", { count: extra })}</Fragment>;
    return (
      <span key={i}>
        <Link href={`/pro/services/${s.id}#questions`} className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
          {s.name}
        </Link>
        {s.status !== "active" && <span className="text-ink-3"> {t("forms.hidden")}</span>}
      </span>
    );
  });
  return <p className="relative z-10 mt-1.5 w-fit max-w-full text-[13px] text-ink-2">{rich(t("forms.askedOn"), { list: () => list })}</p>;
}
