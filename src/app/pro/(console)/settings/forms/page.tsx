import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SettingsCard, SettingsShell } from "@/components/pro/settings-shell";
import { ButtonLink } from "@/components/ui/button";
import { entitlements } from "@/domain/plans";
import { fmtDate } from "@/lib/format";
import { requestNow } from "@/server/clock";
import { proPage } from "@/server/pro-page";
import { listFormsWithUsage, type FormUsage } from "@/server/services/forms-admin";

export const metadata: Metadata = { title: "Client questions" };

export default async function FormsSettingsPage() {
  const { m } = await proPage("services.manage");
  const perms = [...m.permissions];
  const allowed = entitlements(m.plan).intakeForms;
  const forms = allowed ? await listFormsWithUsage(m.businessId) : [];
  const now = requestNow();

  if (!allowed)
    return (
      <SettingsShell title="Client questions" perms={perms}>
        <SettingsCard id="forms-plan" title="Not included in your plan">
          <p className="text-sm leading-relaxed text-ink-2">Intake questions aren&apos;t part of the {entitlements(m.plan).label} plan. Services still take bookings without them.</p>
        </SettingsCard>
      </SettingsShell>
    );

  return (
    <SettingsShell
      title="Client questions"
      description="Questions clients answer while they book: allergies, goals, the car they're bringing. Build a form once, then pick it on each service that needs it."
      perms={perms}
      actions={
        forms.length > 0 ? (
          <ButtonLink href="/pro/settings/forms/new" icon={<Plus className="size-4" />}>
            New form
          </ButtonLink>
        ) : undefined
      }
    >
      {forms.length === 0 ? (
        <section className="rounded-xl border border-line bg-surface px-5 py-8 sm:px-8">
          <h2 className="text-base font-semibold text-ink">No forms yet</h2>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-3 text-pretty">
            Ask what you need to know before the appointment, so you&apos;re not finding out at the chair. Answers are saved on the booking and shown to whoever does the appointment.
          </p>
          <ButtonLink href="/pro/settings/forms/new" icon={<Plus className="size-4" />} className="mt-5">
            Create a form
          </ButtonLink>
        </section>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface" aria-label="Forms">
          {forms.map((f) => {
            const required = f.fields.filter((x) => x.required).length;
            const edited = new Date(f.updatedAt);
            const sameYear = fmtDate(edited, m.timezone, { year: "numeric" }) === fmtDate(new Date(now), m.timezone, { year: "numeric" });
            return (
              <li key={f.id} className="relative flex items-start gap-4 px-4 py-4 hover:bg-surface-2/50 sm:px-5">
                <div className="min-w-0 flex-1">
                  <Link href={`/pro/settings/forms/${f.id}`} className="text-[15px] font-medium text-ink after:absolute after:inset-0 after:content-['']">
                    {f.name}
                  </Link>
                  <p className="mt-0.5 text-[13px] text-ink-3 tabular">
                    {f.fields.length === 0 ? "No questions yet" : `${f.fields.length} question${f.fields.length === 1 ? "" : "s"}${required ? ` · ${required} required` : ""}`}
                    <span className="sm:hidden"> · Edited {fmtDate(edited, m.timezone, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" })}</span>
                  </p>
                  <UsedBy services={f.services} />
                </div>
                <p className="hidden shrink-0 pt-0.5 text-right text-[13px] text-ink-3 tabular sm:block">
                  Edited {fmtDate(edited, m.timezone, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" })}
                </p>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[13px] leading-relaxed text-ink-3">
        To ask a form on a service, open the service and choose it under <span className="font-medium text-ink-2">Questions &amp; requirements</span>. Each service asks at most one form.
      </p>
    </SettingsShell>
  );
}

function UsedBy({ services }: { services: FormUsage[] }) {
  if (!services.length) return <p className="mt-1.5 text-[13px] text-ink-3">Not used by any service yet</p>;
  const shown = services.slice(0, 3);
  return (
    <p className="relative z-10 mt-1.5 w-fit max-w-full text-[13px] text-ink-2">
      Asked on{" "}
      {shown.map((s, i) => (
        <span key={s.id}>
          {i > 0 && (i === shown.length - 1 && services.length <= 3 ? " and " : ", ")}
          <Link href={`/pro/services/${s.id}#questions`} className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
            {s.name}
          </Link>
          {s.status !== "active" && <span className="text-ink-3"> (hidden)</span>}
        </span>
      ))}
      {services.length > 3 && ` and ${services.length - 3} more`}
    </p>
  );
}
