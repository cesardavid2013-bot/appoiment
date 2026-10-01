/** Who may hear about which realtime event (pure; used by server/realtime.ts). */

/** What a connection may hear about, resolved from the viewer's memberships at connect time. */
export type Audience = {
  userId: string;
  /** Businesses where the viewer sees every appointment. */
  allAppointments: Set<string>;
  /** Businesses where the viewer only sees their own appointments → their member id there. */
  ownAppointments: Map<string, string>;
  /** Businesses whose customer inbox the viewer can read. */
  inbox: Set<string>;
};

/** The event as the browser receives it. */
export type RealtimeEvent = { kind: "appointment" | "message" | "read" | "notification"; id: string; conversationId?: string };

export type Raw = { k: "appt" | "msg" | "read" | "ntf"; id: string; b?: string; m?: string | null; pm?: string | null; u?: string | null; c?: string; r?: string };

/** Pure routing rule: may this audience hear about this event, and as what? */
export function routeEvent(raw: Raw, a: Audience): RealtimeEvent | null {
  switch (raw.k) {
    case "appt": {
      const mine = raw.u === a.userId;
      const biz = raw.b != null && (a.allAppointments.has(raw.b) || (a.ownAppointments.has(raw.b) && [raw.m, raw.pm].includes(a.ownAppointments.get(raw.b)!)));
      return mine || biz ? { kind: "appointment", id: raw.id } : null;
    }
    case "msg":
    case "read": {
      const mine = raw.u === a.userId;
      const biz = raw.b != null && a.inbox.has(raw.b);
      if (!mine && !biz) return null;
      return raw.k === "msg" ? { kind: "message", id: raw.id, conversationId: raw.c } : { kind: "read", id: raw.id, conversationId: raw.id };
    }
    case "ntf":
      return raw.u === a.userId ? { kind: "notification", id: raw.id } : null;
    default:
      return null;
  }
}

/** Builds a connection's audience from the viewer's active memberships. */
export function audienceFor(userId: string, memberships: { businessId: string; businessStatus: string; memberId: string; permissions: Set<string> }[]): Audience {
  const a: Audience = { userId, allAppointments: new Set(), ownAppointments: new Map(), inbox: new Set() };
  for (const m of memberships) {
    if (m.businessStatus === "suspended" || m.businessStatus === "closed") continue;
    if (m.permissions.has("appointments.view_all") || m.permissions.has("appointments.manage_all")) a.allAppointments.add(m.businessId);
    else if (m.permissions.has("appointments.manage_own")) a.ownAppointments.set(m.businessId, m.memberId);
    if (m.permissions.has("messages.manage")) a.inbox.add(m.businessId);
  }
  return a;
}
