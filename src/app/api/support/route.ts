import { readJson, route } from "@/server/http";
import { createTicket, createTicketSchema, listMyTickets } from "@/server/services/support";

export const GET = route({ auth: true }, async ({ viewer }) => listMyTickets(viewer.id));

export const POST = route({ auth: true }, async ({ req, viewer }) => createTicket(viewer, await readJson(req, createTicketSchema)));
