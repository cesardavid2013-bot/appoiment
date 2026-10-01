import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { AcceptInviteButton } from "@/components/pro/accept-invite";
import { ROLE_LABELS } from "@/domain/permissions";
import { getViewer } from "@/server/auth/session";
import { getInvite } from "@/server/services/team";

export const metadata: Metadata = { title: "Team invitation", robots: { index: false } };

function maskEmail(e: string) {
  const [user, domain] = e.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.min(4, Math.max(1, user.length - 2)))}@${domain}`;
}

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [invite, viewer] = await Promise.all([getInvite(token.slice(0, 100)), getViewer()]);
  const next = `/invite/${encodeURIComponent(token)}`;

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:py-24">
      {!invite ? (
        <>
          <h1 className="font-display text-4xl leading-tight text-ink">This invitation can&rsquo;t be used</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-3">It may have expired, been cancelled, or already been accepted. Ask the person who invited you to send a new link.</p>
          <ButtonLink href="/" variant="secondary" className="mt-8">
            Go to Kept
          </ButtonLink>
        </>
      ) : (
        <>
          <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-ink-3">Team invitation</p>
          <h1 className="mt-2 font-display text-4xl leading-tight text-ink">Join {invite.businessName}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-3">
            You&rsquo;ve been invited as <span className="font-medium text-ink">{ROLE_LABELS[invite.role].label}</span>. {ROLE_LABELS[invite.role].description}
          </p>
          <div className="mt-8 rounded-lg border border-line bg-surface p-5">
            {!viewer ? (
              <>
                <p className="text-sm text-ink-2">
                  Sign in or create an account with <span className="font-medium text-ink">{maskEmail(invite.email ?? "")}</span> to accept.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ButtonLink href={`/signup?next=${encodeURIComponent(next)}`}>Create account</ButtonLink>
                  <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} variant="secondary">
                    Sign in
                  </ButtonLink>
                </div>
              </>
            ) : viewer.email?.toLowerCase() !== invite.email?.toLowerCase() ? (
              <>
                <p className="text-sm text-ink-2">
                  You&rsquo;re signed in as <span className="font-medium text-ink">{viewer.email}</span>, but this invitation was sent to {maskEmail(invite.email ?? "")}.
                </p>
                <p className="mt-2 text-sm text-ink-3">Sign out and sign in with that address, or ask for an invitation to {viewer.email}.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-2">
                  Accepting as <span className="font-medium text-ink">{viewer.email}</span>.
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
