import "server-only";
import { and, count, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, forbidden, notFound } from "@/domain/errors";
import { ALL_PERMISSIONS, assignableRoles, type MemberRole } from "@/domain/permissions";
import { entitlements } from "@/domain/plans";
import { db } from "../db/client";
import { appointments, businessMembers, businesses, locations, memberLocations, users } from "../db/schema";
import type { Viewer } from "../auth/session";
import type { Membership } from "../authz";
import { audit } from "../audit";
import { randomToken, sha256 } from "../crypto";
import { sendSystemEmail } from "../notify";
import { rateLimit } from "../rate-limit";
import { refreshSearchIndex } from "./business";

const INVITE_DAYS = 7;
const roleEnum = z.enum(["manager", "receptionist", "provider", "custom"]);

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  displayName: z.string().trim().min(1, "Add their name").max(80),
  title: z.string().trim().max(60).nullable().optional(),
  role: roleEnum,
  customPermissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).default([]),
  isBookable: z.boolean().default(true),
});

export const updateMemberSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  title: z.string().trim().max(60).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  role: roleEnum.optional(),
  customPermissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).optional(),
  isBookable: z.boolean(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
  commissionBps: z.number().int().min(0).max(10_000).nullable().optional(),
  locationIds: z.array(z.string().uuid()).max(50).optional(),
  avatarMediaId: z.string().uuid().nullable().optional(),
});

function requireTeamManager(m: Membership) {
  if (!m.permissions.has("team.manage")) throw forbidden("Only the owner can manage the team.");
}

async function assertSeat(m: Membership, addingBookable: boolean) {
  if (!addingBookable) return;
  const [{ n }] = await db
    .select({ n: count() })
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, m.businessId), eq(businessMembers.isBookable, true), inArray(businessMembers.status, ["active", "invited"])));
  const max = entitlements(m.plan).maxBookableMembers;
  if (n >= max) throw new AppError("forbidden", `Your ${entitlements(m.plan).label} plan includes ${max} bookable ${max === 1 ? "professional" : "professionals"}.`);
}

export async function inviteMember(m: Membership, actor: Viewer, input: z.infer<typeof inviteSchema>) {
  requireTeamManager(m);
  await rateLimit("invite", actor.id);
  if (!assignableRoles(m.role).includes(input.role as MemberRole)) throw forbidden("You can't assign that role.");
  if (input.role === "custom" && !entitlements(m.plan).customRoles) throw new AppError("forbidden", "Custom roles are available on Pro and Business plans.");
  await assertSeat(m, input.isBookable);
  const [existing] = await db
    .select({ id: businessMembers.id, status: businessMembers.status })
    .from(businessMembers)
    .leftJoin(users, eq(users.id, businessMembers.userId))
    .where(and(eq(businessMembers.businessId, m.businessId), sql`(${businessMembers.inviteEmail} = ${input.email} or ${users.email} = ${input.email})`, ne(businessMembers.status, "disabled")));
  if (existing) throw new AppError("conflict", existing.status === "invited" ? "This person already has a pending invite." : "This person is already on your team.");
  const token = randomToken(32);
  const [member] = await db
    .insert(businessMembers)
    .values({
      businessId: m.businessId,
      inviteEmail: input.email,
      inviteTokenHash: sha256(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
      role: input.role,
      customPermissions: input.role === "custom" ? input.customPermissions : [],
      displayName: input.displayName,
      title: input.title ?? null,
      isBookable: input.isBookable,
      status: "invited",
    })
    .returning();
  await sendSystemEmail(
    input.email,
    {
      subject: `${actor.name} invited you to join ${m.businessName} on Kept`,
      heading: `Join ${m.businessName}`,
      paragraphs: [`${actor.name} invited you to join the team at ${m.businessName}. You'll be able to see your schedule and manage your appointments.`],
      cta: { label: "Accept invitation", url: `/invite/${token}` },
      footnote: `This invitation expires in ${INVITE_DAYS} days.`,
    },
    "team.invite",
  );
  await audit({ actorUserId: actor.id, actorType: "business", businessId: m.businessId, action: "team.invited", targetType: "member", targetId: member.id, metadata: { role: input.role } });
  return { id: member.id };
}

export async function getInvite(token: string) {
  const [row] = await db
    .select({ id: businessMembers.id, email: businessMembers.inviteEmail, expiresAt: businessMembers.inviteExpiresAt, status: businessMembers.status, role: businessMembers.role, businessName: businesses.name, businessId: businesses.id })
    .from(businessMembers)
    .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
    .where(eq(businessMembers.inviteTokenHash, sha256(token)));
  if (!row || row.status !== "invited" || !row.expiresAt || row.expiresAt < new Date()) return null;
  return row;
}

export async function acceptInvite(viewer: Viewer, token: string) {
  const invite = await getInvite(token);
  if (!invite) throw new AppError("bad_request", "This invitation is invalid or has expired. Ask for a new one.");
  if (!viewer.email || viewer.email.toLowerCase() !== invite.email?.toLowerCase())
    throw new AppError("forbidden", `This invitation was sent to ${invite.email}. Sign in with that email to accept it.`);
  await db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: businessMembers.id }).from(businessMembers).where(and(eq(businessMembers.businessId, invite.businessId), eq(businessMembers.userId, viewer.id)));
    if (dup) throw new AppError("conflict", "You're already part of this team.");
    await tx
      .update(businessMembers)
      .set({ userId: viewer.id, status: "active", inviteTokenHash: null, inviteExpiresAt: null, joinedAt: new Date() })
      .where(eq(businessMembers.id, invite.id));
    await audit({ actorUserId: viewer.id, actorType: "business", businessId: invite.businessId, action: "team.invite_accepted", targetType: "member", targetId: invite.id }, tx);
  });
  await refreshSearchIndex(invite.businessId);
  return { businessId: invite.businessId };
}

export async function updateMember(m: Membership, actorUserId: string, memberId: string, input: z.infer<typeof updateMemberSchema>) {
  const isSelf = memberId === m.memberId;
  if (!isSelf) requireTeamManager(m);
  const [target] = await db.select().from(businessMembers).where(and(eq(businessMembers.id, memberId), eq(businessMembers.businessId, m.businessId)));
  if (!target) throw notFound("That team member");
  const roleChange = input.role && input.role !== target.role;
  if (roleChange || input.customPermissions) {
    if (isSelf) throw forbidden("You can't change your own role.");
    if (target.role === "owner") throw forbidden("The owner's role can't be changed.");
    if (input.role && !assignableRoles(m.role).includes(input.role)) throw forbidden("You can't assign that role.");
  }
  if (!target.isBookable && input.isBookable) await assertSeat(m, true);
  if (input.locationIds) {
    const valid = input.locationIds.length ? await db.select({ id: locations.id }).from(locations).where(and(eq(locations.businessId, m.businessId), inArray(locations.id, input.locationIds))) : [];
    if (valid.length !== new Set(input.locationIds).size) throw new AppError("validation", "One of those locations isn't part of this business.");
  }
  await db.transaction(async (tx) => {
    await tx
      .update(businessMembers)
      .set({
        displayName: input.displayName,
        title: input.title ?? null,
        bio: input.bio ?? null,
        isBookable: input.isBookable,
        color: input.color ?? null,
        ...(isSelf ? {} : { commissionBps: input.commissionBps ?? null }),
        ...(input.avatarMediaId !== undefined ? { avatarMediaId: input.avatarMediaId } : {}),
        ...(input.role && !isSelf && target.role !== "owner" ? { role: input.role, customPermissions: input.role === "custom" ? (input.customPermissions ?? []) : [] } : {}),
      })
      .where(eq(businessMembers.id, memberId));
    if (input.locationIds) {
      await tx.delete(memberLocations).where(eq(memberLocations.memberId, memberId));
      if (input.locationIds.length) await tx.insert(memberLocations).values(input.locationIds.map((locationId) => ({ memberId, locationId })));
    }
    await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: roleChange ? "team.role_changed" : "team.member_updated", targetType: "member", targetId: memberId, metadata: roleChange ? { from: target.role, to: input.role } : undefined }, tx);
  });
  await refreshSearchIndex(m.businessId);
}

/**
 * Removes someone from the team without deleting history. Their past
 * appointments keep pointing at them; upcoming ones are reported so the
 * owner can reassign or cancel.
 */
export async function disableMember(m: Membership, actorUserId: string, memberId: string) {
  requireTeamManager(m);
  const [target] = await db.select().from(businessMembers).where(and(eq(businessMembers.id, memberId), eq(businessMembers.businessId, m.businessId)));
  if (!target) throw notFound("That team member");
  if (target.role === "owner") throw forbidden("The owner can't be removed.");
  await db.update(businessMembers).set({ status: "disabled", disabledAt: new Date(), inviteTokenHash: null }).where(eq(businessMembers.id, memberId));
  const [{ upcoming }] = await db
    .select({ upcoming: count() })
    .from(appointments)
    .where(and(eq(appointments.memberId, memberId), gt(appointments.startsAt, new Date()), inArray(appointments.status, ["confirmed", "requested", "pending_payment"])));
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "team.member_disabled", targetType: "member", targetId: memberId, metadata: { upcoming } });
  await refreshSearchIndex(m.businessId);
  return { upcomingAppointments: upcoming };
}

export async function teamWithDetails(businessId: string) {
  const rows = await db
    .select({
      id: businessMembers.id,
      displayName: businessMembers.displayName,
      title: businessMembers.title,
      bio: businessMembers.bio,
      role: businessMembers.role,
      customPermissions: businessMembers.customPermissions,
      status: businessMembers.status,
      isBookable: businessMembers.isBookable,
      color: businessMembers.color,
      commissionBps: businessMembers.commissionBps,
      inviteEmail: businessMembers.inviteEmail,
      inviteExpiresAt: businessMembers.inviteExpiresAt,
      avatarMediaId: businessMembers.avatarMediaId,
      email: users.email,
      joinedAt: businessMembers.joinedAt,
      upcoming: sql<number>`(select count(*)::int from appointments a where a.member_id = ${businessMembers.id} and a.starts_at > now() and a.status in ('confirmed','requested','pending_payment'))`,
    })
    .from(businessMembers)
    .leftJoin(users, eq(users.id, businessMembers.userId))
    .where(eq(businessMembers.businessId, businessId))
    .orderBy(businessMembers.sortOrder, businessMembers.createdAt);
  const locs = rows.length ? await db.select().from(memberLocations).where(inArray(memberLocations.memberId, rows.map((r) => r.id))) : [];
  return rows.map((r) => ({ ...r, locationIds: locs.filter((l) => l.memberId === r.id).map((l) => l.locationId) }));
}
