import { BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SettingsCard, SettingsShell } from "@/components/pro/settings-shell";
import { VerificationForm } from "@/components/pro/verification-form";
import { MediaImage } from "@/components/ui/media";
import { Badge } from "@/components/ui/misc";
import { fmtDate } from "@/lib/format";
import { proPage } from "@/server/pro-page";
import { getVerificationState } from "@/server/services/verification";

export const metadata: Metadata = { title: "Verification" };

const STATUS: Record<string, { label: string; tone: "neutral" | "positive" | "attention" | "negative" | "info" }> = {
  not_submitted: { label: "Not verified", tone: "neutral" },
  pending: { label: "In review", tone: "info" },
  verified: { label: "Verified", tone: "positive" },
  rejected: { label: "Not approved", tone: "negative" },
  needs_info: { label: "More information needed", tone: "attention" },
};

export default async function VerificationSettingsPage() {
  const { m } = await proPage("business.manage");
  const { status, latest } = await getVerificationState(m.businessId);
  const day = (d: Date | null | undefined) => (d ? fmtDate(d, m.timezone, { month: "long", day: "numeric", year: "numeric" }) : null);
  const s = STATUS[status] ?? STATUS.not_submitted;
  const canSubmit = status === "not_submitted" || status === "rejected" || status === "needs_info";

  return (
    <SettingsShell
      title="Verification"
      description="Show clients that a real, licensed business is behind your profile. Our team checks the documents you send by hand."
      perms={[...m.permissions]}
    >
      <section aria-labelledby="status-h" className="rounded-xl border border-line bg-surface px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="status-h" className="text-base font-semibold text-ink">
            Status
          </h2>
          <Badge tone={s.tone}>{s.label}</Badge>
        </div>
        <div className="mt-3 text-sm leading-relaxed text-ink-2">
          {status === "not_submitted" && <p>You haven&apos;t asked to be verified yet. Send a few details and documents below.</p>}
          {status === "pending" && (
            <p>
              Sent{latest ? ` on ${day(latest.createdAt)}` : ""}. Someone on our team reviews every request by hand; you&apos;ll get a notification as soon as there&apos;s a decision. You can&apos;t change
              the request while it&apos;s in review.
            </p>
          )}
          {status === "verified" && (
            <p>
              {m.businessName} is verified{latest?.reviewedAt ? ` since ${day(latest.reviewedAt)}` : ""}. The badge shows on your{" "}
              <Link href={`/${m.businessSlug}`} target="_blank" className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
                public profile
              </Link>{" "}
              and in search results.
            </p>
          )}
          {status === "rejected" && <p>We couldn&apos;t verify {m.businessName} with what was sent{latest ? ` on ${day(latest.createdAt)}` : ""}. You can send new details and documents below.</p>}
          {status === "needs_info" && <p>Our team needs a bit more before deciding. Answer below and your request goes back into review.</p>}
        </div>
        {(status === "rejected" || status === "needs_info") && latest?.decisionNote && (
          <figure className="mt-4 rounded-lg border border-line bg-surface-2/60 px-4 py-3">
            <figcaption className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">Note from Kept{latest.reviewedAt ? ` · ${day(latest.reviewedAt)}` : ""}</figcaption>
            <blockquote className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink">{latest.decisionNote}</blockquote>
          </figure>
        )}
      </section>

      {canSubmit ? (
        <SettingsCard
          id="submit"
          title={status === "needs_info" ? "Reply to our team" : status === "rejected" ? "Try again" : "Request verification"}
          description={status === "not_submitted" ? "Tell us about the business and attach proof. Most businesses send one licence or registration document." : "We've kept what you sent last time. Change it or add to it."}
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
          <SettingsCard id="sent" title="What you sent" description={`On ${day(latest.createdAt)}.`}>
            {latest.details ? <p className="whitespace-pre-line text-sm leading-relaxed text-ink-2">{latest.details}</p> : <p className="text-sm text-ink-3">No description.</p>}
            {latest.documents.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Documents">
                {latest.documents.map((d, i) => (
                  <li key={d.id}>
                    <a href={d.sources.at(-1)?.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md border border-line hover:border-line-strong" aria-label={`Open document ${i + 1}`}>
                      <MediaImage media={d} alt="" sizes="80px" className="size-20" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {latest.documentMediaIds.length > latest.documents.length && <p className="text-[13px] text-ink-3">Some documents were removed and can no longer be opened.</p>}
          </SettingsCard>
        )
      )}

      <SettingsCard id="meaning" title="What clients see">
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-bg px-4 py-3" aria-label="Example of the verified badge">
          <span className="truncate text-[15px] font-semibold text-ink">{m.businessName}</span>
          <BadgeCheck className="size-[18px] shrink-0 text-accent" aria-hidden />
        </div>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-2">
          <li>A check mark next to your name on your profile and in search results, labelled “Verified business”.</li>
          <li>It means Kept reviewed documents you provided. It isn&apos;t a review of your work or an endorsement — your ratings still come from clients.</li>
          <li>Documents stay private. Only people who manage this business and Kept&apos;s review team can open them.</li>
          <li>Our team can remove the badge later, for example if a licence turns out to be invalid.</li>
        </ul>
      </SettingsCard>
    </SettingsShell>
  );
}
