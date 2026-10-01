import { readJson, route } from "@/server/http";
import { addAddress, addressSchema, listAddresses } from "@/server/services/account";

export const GET = route({ auth: true }, async ({ viewer }) => listAddresses(viewer.id));

export const POST = route({ auth: true }, async ({ req, viewer }) => addAddress(viewer, await readJson(req, addressSchema)));
