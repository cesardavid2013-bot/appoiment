import { BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SettingsCard, SettingsShell } from "@/components/pro/settings-shell";
import { VerificationForm } from "@/components/pro/verification-form";
import { MediaImage } from "@/components/ui/media";
import { Badge } from "@/components/ui/misc";
import { rich } from "@/i18n/rich";
import { getI18n, getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { proPage } from "@/server/pro-page";
import { getVerificationState } from "@/server/services/verification";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSettings");
  return { title: t("verification.title") };
}

const TONE: Record<string, "neutral" | "positive" | "attention" | "negative" | "info"> = {
  not_submitted: "neutral",
  pending: "info",
  verified: "positive",
  rejected: "negative",
  needs_info: "attention",
};

export default async function VerificationSettingsPage() {
  const { m } = await proPage("business.manage");
  const [{ status, latest }, t, { intl }] = await Promise.all([getVerificationState(m.businessId), getT("proSettings"), getI18n()]);
  const day = (d: Date | null | undefined) => (d ? fmtDate(d, m.timezone, { month: "long", day: "numeric", year: "numeric" }, intl) : null);
  const known = status in TONE ? status : "not_submitted";
  const canSubmit = status === "not_submitted" || status === "rejected" || status === "needs_info";
  const profileLink = (c: ReactNode) => (
    <Link href={`/${m.businessSlug}`} target="_blank" className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
      {c}
    </Link>
  );
  const sentOn = day(latest?.createdAt);
  const reviewedOn = day(latest?.reviewedAt);

  return (
    <SettingsShell title={t("verification.title")} description={t("verification.description")} perms={[...m.permissions]}>
      <section aria-labelledby="status-h" className="rounded-xl border border-line bg-surface px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="status-h" className="text-base font-semibold text-ink">
            {t("verification.status.title")}
          </h2>
          <Badge tone={TONE[known]}>{t(`verification.status.${known}`)}</Badge>
        </div>
        <div className="mt-3 text-sm leading-relaxed text-ink-2">
          {status === "not_submitted" && <p>{t("verification.body.notSubmitted")}</p>}
          {status === "pending" && <p>{sentOn ? t("verification.body.pending", { date: sentOn }) : t("verification.body.pendingNoDate")}</p>}
          {status === "verified" && (
            <p>{rich(reviewedOn ? t("verification.body.verified", { name: m.businessName, date: reviewedOn }) : t("verification.body.verifiedNoDate", { name: m.businessName }), { link: profileLink })}</p>
          )}
          {status === "rejected" && <p>{sentOn ? t("verification.body.rejected", { name: m.businessName, date: sentOn }) : t("verification.body.rejectedNoDate", { name: m.businessName })}</p>}
          {status === "needs_info" && <p>{t("verification.body.needsInfo")}</p>}
        </div>
        {(status === "rejected" || status === "needs_info") && latest?.decisionNote && (
          <figure className="mt-4 rounded-lg border border-line bg-surface-2/60 px-4 py-3">
            <figcaption className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">{reviewedOn ? t("verification.noteDate", { date: reviewedOn }) : t("verification.note")}</figcaption>
            <blockquote className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink">{latest.decisionNote}</blockquote>
          </figure>
        )}
      </section>

      {canSubmit ? (
        <SettingsCard
          id="submit"
          title={status === "needs_info" ? t("verification.submit.replyTitle") : status === "rejected" ? t("verification.submit.retryTitle") : t("verification.submit.requestTitle")}
          description={status === "not_submitted" ? t("verification.submit.firstDescription") : t("verification.submit.againDescription")}
        >
          <VerificationForm
            businessId={m.businessId}
            mode={status === "needs_info" ? "reply" : status === "rejected" ? "resubmit" : "first"}
            initialDetails={status === "not_submitted" ? "" : (latest?.details ?? "")}
            initialDocs={status === "not_submitted" ? [] : (latest?.documents ?? [])}
          />
        </SettingsCard>
      ) : (
        latest && (
          <SettingsCard id="sent" title={t("verification.sent.title")} description={t("verification.sent.description", { date: sentOn })}>
            {latest.details ? <p className="whitespace-pre-line text-sm leading-relaxed text-ink-2">{latest.details}</p> : <p className="text-sm text-ink-3">{t("verification.sent.noDescription")}</p>}
            {latest.documents.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label={t("verification.sent.documents")}>
                {latest.documents.map((d, i) => (
                  <li key={d.id}>
                    <a href={d.sources.at(-1)?.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md border border-line hover:border-line-strong" aria-label={t("verification.sent.open", { n: i + 1 })}>
                      <MediaImage media={d} alt="" sizes="80px" className="size-20" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {latest.documentMediaIds.length > latest.documents.length && <p className="text-[13px] text-ink-3">{t("verification.sent.removed")}</p>}
          </SettingsCard>
        )
      )}

      <SettingsCard id="meaning" title={t("verification.meaning.title")}>
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-bg px-4 py-3" aria-label={t("verification.meaning.example")}>
          <span className="truncate text-[15px] font-semibold text-ink">{m.businessName}</span>
          <BadgeCheck className="size-[18px] shrink-0 text-accent" aria-hidden />
        </div>
        <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-ink-2">
          <li>{t("verification.meaning.checkMark")}</li>
          <li>{t("verification.meaning.notEndorsement")}</li>
          <li>{t("verification.meaning.private")}</li>
          <li>{t("verification.meaning.removable")}</li>
        </ul>
      </SettingsCard>
    </SettingsShell>
  );
}
