import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { AcceptInviteButton } from "@/components/pro/accept-invite";
import { rich } from "@/components/account/rich";
import { getT } from "@/i18n/server";
import { getViewer } from "@/server/auth/session";
import { getInvite } from "@/server/services/team";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("account");
  return { title: t("invite.eyebrow"), robots: { index: false } };
}

function maskEmail(e: string) {
  const [user, domain] = e.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.min(4, Math.max(1, user.length - 2)))}@${domain}`;
}

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [invite, viewer, t] = await Promise.all([getInvite(token.slice(0, 100)), getViewer(), getT("account")]);
  const strong = (text: string) => <span className="font-medium text-ink">{text}</span>;
  const next = `/invite/${encodeURIComponent(token)}`;

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:py-24">
      {!invite ? (
        <>
          <h1 className="font-display text-4xl leading-tight text-ink">{t("invite.invalidTitle")}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-3">{t("invite.invalidBody")}</p>
          <ButtonLink href="/" variant="secondary" className="mt-8">
            {t("invite.goHome")}
          </ButtonLink>
        </>
      ) : (
        <>
          <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-ink-3">{t("invite.eyebrow")}</p>
          <h1 className="mt-2 font-display text-4xl leading-tight text-ink">{t("invite.join", { business: invite.businessName })}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-3">
            {rich(t("invite.invitedAs", { role: t(`invite.roles.${invite.role}.label`) }), { b: strong })} {t(`invite.roles.${invite.role}.description`)}
          </p>
          <div className="mt-8 rounded-lg border border-line bg-surface p-5">
            {!viewer ? (
              <>
                <p className="text-sm text-ink-2">
                  {rich(t("invite.signInWith", { email: maskEmail(invite.email ?? "") }), { b: strong })}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ButtonLink href={`/signup?next=${encodeURIComponent(next)}`}>{t("invite.createAccount")}</ButtonLink>
                  <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} variant="secondary">
                    {t("invite.signIn")}
                  </ButtonLink>
                </div>
              </>
            ) : viewer.email?.toLowerCase() !== invite.email?.toLowerCase() ? (
              <>
                <p className="text-sm text-ink-2">
                  {rich(t("invite.wrongAccount", { email: viewer.email ?? "", invited: maskEmail(invite.email ?? "") }), { b: strong })}
                </p>
                <p className="mt-2 text-sm text-ink-3">{t("invite.wrongAccountHint", { email: viewer.email ?? "" })}</p>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-2">
                  {rich(t("invite.acceptingAs", { email: viewer.email ?? "" }), { b: strong })}
                </p>
                <AcceptInviteButton token={token} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
