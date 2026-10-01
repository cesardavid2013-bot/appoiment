export type AppointmentStatus =
  | "pending_payment"
  | "requested"
  | "confirmed"
  | "checked_in"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "declined"
  | "no_show"
  | "expired";

const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  pending_payment: ["confirmed", "requested", "expired", "cancelled"],
  requested: ["confirmed", "declined", "cancelled", "expired"],
  confirmed: ["checked_in", "in_progress", "completed", "cancelled", "no_show"],
  checked_in: ["in_progress", "completed", "cancelled"],
  in_progress: ["completed"],
  // Allow correcting a mistaken no-show within the business tools.
  no_show: ["completed"],
  completed: [],
  cancelled: [],
  declined: [],
  expired: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Statuses that hold a slot in the calendar. */
export const OCCUPYING_STATUSES: readonly AppointmentStatus[] = [
  "pending_payment",
  "requested",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "no_show",
];

export const RELEASING_STATUSES: readonly AppointmentStatus[] = ["cancelled", "declined", "expired"];

export const UPCOMING_STATUSES: readonly AppointmentStatus[] = ["pending_payment", "requested", "confirmed", "checked_in", "in_progress"];

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending_payment: "Awaiting payment",
  requested: "Request sent",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  no_show: "No-show",
  expired: "Expired",
};

export type StatusTone = "neutral" | "positive" | "attention" | "negative" | "info";

export const STATUS_TONE: Record<AppointmentStatus, StatusTone> = {
  pending_payment: "attention",
  requested: "attention",
  confirmed: "positive",
  checked_in: "info",
  in_progress: "info",
  completed: "neutral",
  cancelled: "negative",
  declined: "negative",
  no_show: "negative",
  expired: "neutral",
};
