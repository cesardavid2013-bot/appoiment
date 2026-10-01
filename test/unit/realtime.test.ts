import { describe, expect, it } from "vitest";
import { audienceFor, routeEvent, type Audience } from "@/domain/realtime";

const perms = (...p: string[]) => new Set(p);
const owner = audienceFor("u-owner", [{ businessId: "b1", businessStatus: "active", memberId: "m-owner", permissions: perms("appointments.view_all", "messages.manage") }]);
const provider = audienceFor("u-pro", [{ businessId: "b1", businessStatus: "active", memberId: "m-pro", permissions: perms("appointments.manage_own") }]);
const customer: Audience = audienceFor("u-cust", []);
const stranger: Audience = audienceFor("u-x", [{ businessId: "b2", businessStatus: "active", memberId: "m-x", permissions: perms("appointments.view_all", "messages.manage") }]);
const suspended = audienceFor("u-s", [{ businessId: "b1", businessStatus: "suspended", memberId: "m-s", permissions: perms("appointments.view_all", "messages.manage") }]);

describe("realtime routing", () => {
  const appt = { k: "appt" as const, id: "a1", b: "b1", m: "m-pro", pm: null, u: "u-cust" };

  it("delivers appointment changes to the customer, full-view staff and the assigned provider only", () => {
    expect(routeEvent(appt, customer)).toEqual({ kind: "appointment", id: "a1" });
    expect(routeEvent(appt, owner)).toEqual({ kind: "appointment", id: "a1" });
    expect(routeEvent(appt, provider)).toEqual({ kind: "appointment", id: "a1" });
    expect(routeEvent({ ...appt, m: "m-other" }, provider)).toBeNull();
    expect(routeEvent(appt, stranger)).toBeNull();
    expect(routeEvent(appt, suspended)).toBeNull();
  });

  it("tells the previous provider when an appointment is moved away from them", () => {
    expect(routeEvent({ ...appt, m: "m-other", pm: "m-pro" }, provider)).toEqual({ kind: "appointment", id: "a1" });
  });

  it("routes messages and read receipts to the conversation's two sides", () => {
    const msg = { k: "msg" as const, id: "x1", c: "c1", b: "b1", u: "u-cust", r: "customer" };
    expect(routeEvent(msg, customer)).toEqual({ kind: "message", id: "x1", conversationId: "c1" });
    expect(routeEvent(msg, owner)).toEqual({ kind: "message", id: "x1", conversationId: "c1" });
    expect(routeEvent(msg, provider)).toBeNull(); // no inbox permission
    expect(routeEvent(msg, stranger)).toBeNull();
    expect(routeEvent({ k: "read", id: "c1", b: "b1", u: "u-cust" }, owner)).toEqual({ kind: "read", id: "c1", conversationId: "c1" });
  });

  it("sends notifications only to their recipient and ignores unknown payloads", () => {
    expect(routeEvent({ k: "ntf", id: "n1", u: "u-cust" }, customer)).toEqual({ kind: "notification", id: "n1" });
    expect(routeEvent({ k: "ntf", id: "n1", u: "u-cust" }, owner)).toBeNull();
    expect(routeEvent({ k: "zzz" as never, id: "?" }, owner)).toBeNull();
  });
});
