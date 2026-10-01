import type { MediaLike } from "@/components/ui/media";

export type ThreadAppointment = { id: string; reference: string; status: string; startsAt: string; timezone: string; serviceName: string };

/** A message as the client sees it (dates as ISO strings, exactly as the API returns them). */
export type ThreadMessage = {
  id: string;
  body: string;
  senderRole: "customer" | "business" | "system";
  senderUserId: string | null;
  senderName: string;
  mine: boolean;
  createdAt: string;
  /** Microsecond-precise createdAt, used for `after` / `before` paging. */
  cursor: string;
  media: MediaLike | null;
  appointment: ThreadAppointment | null;
};

export type ThreadPayload = {
  id: string;
  messages: ThreadMessage[];
  hasMore: boolean;
  otherLastReadAt: string | null;
  markedRead: boolean;
};

/** Server → client: Dates become ISO strings, the same shape the JSON API returns. */
export function toClient<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
