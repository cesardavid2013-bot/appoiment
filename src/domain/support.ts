/** Support ticket vocabulary shared by the customer help center and the admin console. */
export const SUPPORT_CATEGORIES = {
  booking: { label: "Booking", hint: "Changes, cancellations or problems with an appointment." },
  payment: { label: "Payment", hint: "Charges, deposits, refunds or tips." },
  account: { label: "Account", hint: "Signing in, your profile or your data." },
  report: { label: "Report a business", hint: "Safety concerns, misleading listings or misconduct." },
  other: { label: "Other", hint: "Anything else we can help with." },
} as const;

export type SupportCategory = keyof typeof SUPPORT_CATEGORIES;
export const SUPPORT_CATEGORY_KEYS = Object.keys(SUPPORT_CATEGORIES) as [SupportCategory, ...SupportCategory[]];

export type TicketStatus = "open" | "awaiting_customer" | "resolved" | "closed";

/** Labels are written from the customer's point of view. */
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Waiting on support",
  awaiting_customer: "Replied",
  resolved: "Resolved",
  closed: "Closed",
};

export const TICKET_STATUS_TONE: Record<TicketStatus, "neutral" | "positive" | "attention" | "info"> = {
  open: "info",
  awaiting_customer: "attention",
  resolved: "positive",
  closed: "neutral",
};

export const MAX_TICKET_ATTACHMENTS = 4;

export function categoryLabel(category: string): string {
  return (SUPPORT_CATEGORIES as Record<string, { label: string }>)[category]?.label ?? "Other";
}
