import "server-only";
import { verifyPassword } from "../auth/password";
import { rateLimit } from "../rate-limit";
import { and, asc, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { DELETE_CONFIRMATION, isValidTimeZone, MAX_SAVED_ADDRESSES, mergeNotificationPrefs, normalizePhone } from "@/domain/account";
import { AppError, notFound } from "@/domain/errors";
import { NOTIFICATION_TOPICS, resolvePrefs, type NotificationTopic } from "@/domain/notifications";
import { db } from "../db/client";
import { isUniqueViolation } from "../db/errors";
import {
  appointments,
  authTokens,
  businessMembers,
  businesses,
  conversations,
  favorites,
  media,
  messages,
  notifications,
  oauthAccounts,
  recentViews,
  reviews,
  sessions,
  supportMessages,
  supportTickets,
  userAddresses,
  users,
  waitlistEntries,
} from "../db/schema";
import { destroyAllSessions, type Viewer } from "../auth/session";
import { audit } from "../audit";
import { features } from "../env";
import { ipHash } from "../request";
import { assertMediaOwned, getMediaMap } from "./media";
import { changePassword as changePasswordCore } from "./auth";

/** Audit metadata is best-effort outside a request (scripts, tests). */
async function safeIpHash() {
  return ipHash().catch(() => null);
}

/* ───────────────────────────── Profile ───────────────────────────── */

/**
 * Partial update: omitted fields are left unchanged; `null` clears an
 * optional field. (The photo is saved on its own as soon as it's uploaded.)
 */
export const profileSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(80, "Keep your name under 80 characters").optional(),
  timezone: z
    .string()
    .trim()
    .max(64)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null))
    .refine((v) => v == null || isValidTimeZone(v), "Choose a valid time zone"),
  phone: z
    .string()
    .max(40)
    .nullable()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      if (!v || !v.trim()) return null;
      const n = normalizePhone(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: "Enter a valid phone number, like +1 555 123 4567" });
        return z.NEVER;
      }
      return n;
    }),
  avatarMediaId: z.string().uuid().nullable().optional(),
});

/** Everything the account settings pages show about the signed-in user. */
export async function getAccount(userId: string) {
  const [u] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      phone: users.phone,
      timezone: users.timezone,
      avatarMediaId: users.avatarMediaId,
      hasPassword: sql<boolean>`${users.passwordHash} is not null`,
      notificationPrefs: users.notificationPrefs,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.status, "active")));
  if (!u) throw notFound("Your account");
  const avatar = u.avatarMediaId ? ((await getMediaMap([u.avatarMediaId])).get(u.avatarMediaId) ?? null) : null;
  return { ...u, avatar, prefs: resolvePrefs(u.notificationPrefs) };
}

export async function updateProfile(viewer: Viewer, input: z.infer<typeof profileSchema>) {
  if (input.avatarMediaId) {
    const m = await assertMediaOwned(input.avatarMediaId, { userId: viewer.id });
    if (m.kind !== "image") throw new AppError("validation", "Your photo must be an image.");
  }
  const [current] = await db.select({ phone: users.phone, avatarMediaId: users.avatarMediaId }).from(users).where(eq(users.id, viewer.id));
  const phoneChanged = input.phone !== undefined && (current?.phone ?? null) !== input.phone;
  const set: Partial<typeof users.$inferInsert> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.timezone !== undefined) set.timezone = input.timezone;
  if (phoneChanged) Object.assign(set, { phone: input.phone, phoneVerifiedAt: null });
  if (input.avatarMediaId !== undefined) set.avatarMediaId = input.avatarMediaId;
  if (!Object.keys(set).length) return { ok: true };
  try {
    await db.update(users).set(set).where(eq(users.id, viewer.id));
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("conflict", "That phone number is already used by another account.", { fields: { phone: "Already in use on another account" } });
    }
    throw err;
  }
  // A replaced or removed photo is no longer referenced anywhere.
  if (input.avatarMediaId !== undefined && current?.avatarMediaId && current.avatarMediaId !== input.avatarMediaId) {
    await db.update(media).set({ deletedAt: new Date() }).where(and(eq(media.id, current.avatarMediaId), eq(media.ownerUserId, viewer.id), isNull(media.businessId)));
  }
  return { ok: true };
}

/* ───────────────────────────── Security ──────────────────────────── */

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(200).default(""),
  newPassword: z.string().min(1, "Choose a new password").max(200),
});

export async function changePassword(viewer: Viewer, input: z.infer<typeof changePasswordSchema>) {
  await rateLimit("passwordCheck", viewer.id);
  const [u] = await db.select({ hasPassword: sql<boolean>`${users.passwordHash} is not null` }).from(users).where(eq(users.id, viewer.id));
  if (u?.hasPassword && !input.currentPassword) {
    throw new AppError("validation", "Enter your current password.", { fields: { currentPassword: "Enter your current password" } });
  }
  await changePasswordCore(viewer, input.currentPassword, input.newPassword);
  return { ok: true };
}

/** Other devices currently signed in to this account. */
export async function otherSessionCount(viewer: Viewer) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(and(eq(sessions.userId, viewer.id), ne(sessions.id, viewer.sessionId), gt(sessions.expiresAt, new Date())));
  return r?.n ?? 0;
}

export async function signOutOtherDevices(viewer: Viewer) {
  const before = await otherSessionCount(viewer);
  await destroyAllSessions(viewer.id, viewer.sessionId);
  await audit({ actorUserId: viewer.id, actorType: "customer", action: "user.sessions_revoked", targetType: "user", targetId: viewer.id, metadata: { count: before }, ipHash: await safeIpHash() });
  return { signedOut: before };
}

/* ─────────────────────────── Notifications ───────────────────────── */

const topicKeys = Object.keys(NOTIFICATION_TOPICS) as [NotificationTopic, ...NotificationTopic[]];
export const notificationPrefsSchema = z.object({
  prefs: z.partialRecord(z.enum(topicKeys), z.object({ email: z.boolean().optional(), sms: z.boolean().optional() })),
});

export async function updateNotificationPrefs(viewer: Viewer, input: z.infer<typeof notificationPrefsSchema>) {
  return db.transaction(async (tx) => {
    const [u] = await tx.select({ prefs: users.notificationPrefs }).from(users).where(eq(users.id, viewer.id)).for("update");
    const next = mergeNotificationPrefs(u?.prefs, input.prefs, { smsAvailable: features.sms });
    await tx.update(users).set({ notificationPrefs: next }).where(eq(users.id, viewer.id));
    return next;
  });
}

/* ─────────────────────────── Saved addresses ─────────────────────── */

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

export const addressSchema = z.object({
  label: z.string().trim().min(1, "Give this address a name, like Home").max(40),
  line1: z.string().trim().min(1, "Enter a street address").max(120),
  line2: optText(120),
  city: z.string().trim().min(1, "Enter a city").max(80),
  region: optText(80),
  postalCode: optText(20),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Choose a country")
    .default("US"),
});

export async function listAddresses(userId: string) {
  return db
    .select({ id: userAddresses.id, label: userAddresses.label, line1: userAddresses.line1, line2: userAddresses.line2, city: userAddresses.city, region: userAddresses.region, postalCode: userAddresses.postalCode, country: userAddresses.country })
    .from(userAddresses)
    .where(eq(userAddresses.userId, userId))
    .orderBy(asc(userAddresses.createdAt));
}

export async function addAddress(viewer: Viewer, input: z.infer<typeof addressSchema>) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(userAddresses).where(eq(userAddresses.userId, viewer.id));
  if (n >= MAX_SAVED_ADDRESSES) throw new AppError("conflict", `You can save up to ${MAX_SAVED_ADDRESSES} addresses. Remove one to add another.`);
  const [row] = await db
    .insert(userAddresses)
    .values({ userId: viewer.id, ...input })
    .returning({ id: userAddresses.id, label: userAddresses.label, line1: userAddresses.line1, line2: userAddresses.line2, city: userAddresses.city, region: userAddresses.region, postalCode: userAddresses.postalCode, country: userAddresses.country });
  return row;
}

export async function deleteAddress(viewer: Viewer, id: string) {
  const rows = await db.delete(userAddresses).where(and(eq(userAddresses.id, id), eq(userAddresses.userId, viewer.id))).returning({ id: userAddresses.id });
  if (!rows.length) throw notFound("That address");
  return { ok: true };
}

/* ─────────────────────────── Privacy & data ──────────────────────── */

/** A portable copy of the personal data we hold for this user (GDPR/CCPA-style access request). */
export async function exportMyData(viewer: Viewer) {
  const uid = viewer.id;
  const [profile] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      phone: users.phone,
      timezone: users.timezone,
      notificationPrefs: users.notificationPrefs,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.id, uid));
  if (!profile) throw notFound("Your account");

  const [addresses, appts, myReviews, favs, convs, tickets] = await Promise.all([
    listAddresses(uid),
    db
      .select({
        reference: appointments.reference,
        status: appointments.status,
        business: businesses.name,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        timezone: appointments.timezone,
        details: appointments.snapshot,
        customerNote: appointments.customerNote,
        serviceAddress: appointments.serviceAddress,
        intakeAnswers: appointments.intakeAnswers,
        currency: appointments.currency,
        totalCents: appointments.totalCents,
        amountPaidCents: appointments.amountPaidCents,
        amountRefundedCents: appointments.amountRefundedCents,
        tipCents: appointments.tipCents,
        paymentStatus: appointments.paymentStatus,
        cancelledAt: appointments.cancelledAt,
        cancellationReason: appointments.cancellationReason,
        createdAt: appointments.createdAt,
      })
      .from(appointments)
      .innerJoin(businesses, eq(businesses.id, appointments.businessId))
      .where(eq(appointments.customerUserId, uid))
      .orderBy(desc(appointments.startsAt)),
    db
      .select({ business: businesses.name, rating: reviews.rating, body: reviews.body, status: reviews.status, businessResponse: reviews.responseBody, createdAt: reviews.createdAt })
      .from(reviews)
      .innerJoin(businesses, eq(businesses.id, reviews.businessId))
      .where(eq(reviews.customerUserId, uid))
      .orderBy(desc(reviews.createdAt)),
    db
      .select({ business: businesses.name, profile: businesses.slug, savedAt: favorites.createdAt })
      .from(favorites)
      .innerJoin(businesses, eq(businesses.id, favorites.businessId))
      .where(eq(favorites.userId, uid))
      .orderBy(desc(favorites.createdAt)),
    db
      .select({ id: conversations.id, business: businesses.name })
      .from(conversations)
      .innerJoin(businesses, eq(businesses.id, conversations.businessId))
      .where(eq(conversations.customerUserId, uid)),
    db
      .select({ id: supportTickets.id, category: supportTickets.category, subject: supportTickets.subject, status: supportTickets.status, createdAt: supportTickets.createdAt })
      .from(supportTickets)
      .where(eq(supportTickets.userId, uid))
      .orderBy(desc(supportTickets.createdAt)),
  ]);

  const msgRows = convs.length
    ? await db
        .select({ conversationId: messages.conversationId, from: messages.senderRole, body: messages.body, sentAt: messages.createdAt })
        .from(messages)
        .where(and(inArray(messages.conversationId, convs.map((c) => c.id)), isNull(messages.deletedAt)))
        .orderBy(asc(messages.createdAt))
        .limit(20_000)
    : [];
  const ticketMsgs = tickets.length
    ? await db
        .select({ ticketId: supportMessages.ticketId, fromSupport: supportMessages.isStaff, body: supportMessages.body, sentAt: supportMessages.createdAt })
        .from(supportMessages)
        .where(inArray(supportMessages.ticketId, tickets.map((t) => t.id)))
        .orderBy(asc(supportMessages.createdAt))
    : [];

  await audit({ actorUserId: uid, actorType: "customer", action: "user.data_exported", targetType: "user", targetId: uid, ipHash: await safeIpHash() });

  return {
    exportedAt: new Date().toISOString(),
    notice: "This file contains the personal data Kept holds about your account. Keep it somewhere safe.",
    profile,
    savedAddresses: addresses,
    appointments: appts,
    reviews: myReviews,
    favorites: favs,
    conversations: convs.map((c) => ({
      business: c.business,
      messages: msgRows.filter((m) => m.conversationId === c.id).map((m) => ({ from: m.from, body: m.body, sentAt: m.sentAt })),
    })),
    supportRequests: tickets.map((t) => ({
      ...t,
      messages: ticketMsgs.filter((m) => m.ticketId === t.id).map((m) => ({ fromSupport: m.fromSupport, body: m.body, sentAt: m.sentAt })),
    })),
  };
}

const CANCELLABLE = ["pending_payment", "requested", "confirmed"] as const;

/** What stands between the user and deleting their account, shown before they confirm. */
export async function deletionCheck(userId: string) {
  const [owned, [upcoming]] = await Promise.all([
    db
      .select({ id: businesses.id, name: businesses.name, status: businesses.status })
      .from(businesses)
      .where(and(eq(businesses.ownerUserId, userId), inArray(businesses.status, ["active", "suspended"]))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(appointments)
      .where(and(eq(appointments.customerUserId, userId), inArray(appointments.status, [...CANCELLABLE]), gt(appointments.startsAt, new Date()))),
  ]);
  return { blockingBusinesses: owned.map((b) => ({ id: b.id, name: b.name })), upcomingCount: upcoming?.n ?? 0 };
}

export const deleteAccountSchema = z.object({
  confirm: z.string().trim(),
  password: z.string().max(200).default(""),
});

/**
 * Closes the account. Personal details are erased and the user can no longer
 * sign in, but booking, payment and review history is kept (anonymised) because
 * businesses and accounting rely on it. Future appointments are cancelled under
 * each business's normal cancellation policy so their calendars free up.
 */
export async function deleteAccount(viewer: Viewer, input: z.infer<typeof deleteAccountSchema>) {
  if (input.confirm !== DELETE_CONFIRMATION) {
    throw new AppError("validation", `Type ${DELETE_CONFIRMATION} to confirm.`, { fields: { confirm: `Type ${DELETE_CONFIRMATION} to confirm` } });
  }
  // Re-authenticate: a borrowed unlocked phone shouldn't be enough to erase an account.
  await rateLimit("passwordCheck", viewer.id);
  const [cred] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, viewer.id));
  if (cred?.hash && !(await verifyPassword(cred.hash, input.password))) {
    throw new AppError("validation", "That password isn't right.", { fields: { password: "That password isn't right" } });
  }
  const check = await deletionCheck(viewer.id);
  if (check.blockingBusinesses.length) {
    const names = check.blockingBusinesses.map((b) => b.name).join(", ");
    throw new AppError("conflict", `You own ${names}. Close the business or transfer ownership before deleting your account.`);
  }

  // Cancel through the normal booking path so refunds, calendars, waitlists and notifications all behave.
  const future = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.customerUserId, viewer.id), inArray(appointments.status, [...CANCELLABLE]), gt(appointments.startsAt, new Date())));
  const { customerCancel } = await import("./booking");
  for (const a of future) {
    try {
      await customerCancel(viewer, a.id, "The customer closed their Kept account.");
    } catch (err) {
      // Raced with the business (e.g. just declined it) — anything no longer cancellable is fine to leave.
      if (!(err instanceof AppError && (err.code === "conflict" || err.code === "not_found"))) throw err;
    }
  }

  const ip = await safeIpHash();
  await db.transaction(async (tx) => {
    const [u] = await tx.select({ avatarMediaId: users.avatarMediaId, status: users.status }).from(users).where(eq(users.id, viewer.id)).for("update");
    if (!u || u.status === "deleted") throw notFound("Your account");
    // Re-check inside the transaction so a business can't be published in between.
    const [stillOwns] = await tx
      .select({ id: businesses.id })
      .from(businesses)
      .where(and(eq(businesses.ownerUserId, viewer.id), inArray(businesses.status, ["active", "suspended"])))
      .limit(1);
    if (stillOwns) throw new AppError("conflict", "You own a business on Kept. Close it or transfer ownership before deleting your account.");

    const now = new Date();
    await tx
      .update(users)
      .set({
        status: "deleted",
        name: "Deleted user",
        email: null,
        emailVerifiedAt: null,
        phone: null,
        phoneVerifiedAt: null,
        passwordHash: null,
        avatarMediaId: null,
        timezone: null,
        notificationPrefs: {},
        deletedAt: now,
      })
      .where(eq(users.id, viewer.id));
    await tx.delete(sessions).where(eq(sessions.userId, viewer.id));
    await tx.delete(oauthAccounts).where(eq(oauthAccounts.userId, viewer.id));
    await tx.delete(authTokens).where(eq(authTokens.userId, viewer.id));
    await tx.delete(userAddresses).where(eq(userAddresses.userId, viewer.id));
    await tx.delete(favorites).where(eq(favorites.userId, viewer.id));
    await tx.delete(recentViews).where(eq(recentViews.userId, viewer.id));
    await tx.delete(notifications).where(eq(notifications.userId, viewer.id));
    await tx
      .update(waitlistEntries)
      .set({ status: "cancelled" })
      .where(and(eq(waitlistEntries.customerUserId, viewer.id), inArray(waitlistEntries.status, ["active", "notified"])));
    if (u.avatarMediaId) await tx.update(media).set({ deletedAt: now }).where(and(eq(media.id, u.avatarMediaId), eq(media.ownerUserId, viewer.id)));
    // Staff seats at other businesses stop being bookable; the businesses keep their history.
    await tx
      .update(businessMembers)
      .set({ status: "disabled", disabledAt: now, isBookable: false })
      .where(and(eq(businessMembers.userId, viewer.id), ne(businessMembers.role, "owner"), ne(businessMembers.status, "disabled")));
    // Unpublished drafts can't be taken over by anyone; close them.
    await tx.update(businesses).set({ status: "closed" }).where(and(eq(businesses.ownerUserId, viewer.id), eq(businesses.status, "draft")));
    await audit({ actorUserId: viewer.id, actorType: "customer", action: "user.deleted", targetType: "user", targetId: viewer.id, metadata: { cancelledAppointments: future.length }, ipHash: ip }, tx);
  });
  return { ok: true, cancelledAppointments: future.length };
}
