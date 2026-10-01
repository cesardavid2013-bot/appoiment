import type { Metadata } from "next";
import { TeamManager } from "@/components/pro/team-manager";
import { assignableRoles } from "@/domain/permissions";
import { entitlements } from "@/domain/plans";
import { getT } from "@/i18n/server";
import { requestNow } from "@/server/clock";
import { proPage } from "@/server/pro-page";
import { listLocations } from "@/server/services/locations";
import { getMediaMap } from "@/server/services/media";
import { teamWithDetails } from "@/server/services/team";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSetup");
  return { title: t("team.title") };
}

export default async function TeamPage() {
  const { m } = await proPage("team.manage");
  const [team, locs] = await Promise.all([teamWithDetails(m.businessId), listLocations(m.businessId)]);
  const media = await getMediaMap(team.map((t) => t.avatarMediaId));
  const plan = entitlements(m.plan);
  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6 lg:px-10 lg:pt-10">
      <TeamManager
        now={requestNow()}
        businessId={m.businessId}
        selfMemberId={m.memberId}
        assignable={assignableRoles(m.role)}
        plan={{ label: plan.label, maxBookable: plan.maxBookableMembers, customRoles: plan.customRoles }}
        locations={locs.map((l) => ({ id: l.id, name: l.name }))}
        members={team.map((t) => ({
          id: t.id,
          name: t.displayName,
          title: t.title,
          bio: t.bio,
          role: t.role,
          customPermissions: t.customPermissions ?? [],
          status: t.status,
          isBookable: t.isBookable,
          color: t.color,
          commissionBps: t.commissionBps,
          email: t.email ?? t.inviteEmail,
          inviteExpiresAt: t.inviteExpiresAt?.toISOString() ?? null,
          joinedAt: t.joinedAt?.toISOString() ?? null,
          upcoming: t.upcoming,
          locationIds: t.locationIds,
          avatarMediaId: t.avatarMediaId,
          avatar: t.avatarMediaId ? (media.get(t.avatarMediaId) ?? null) : null,
        }))}
      />
    </div>
  );
}
