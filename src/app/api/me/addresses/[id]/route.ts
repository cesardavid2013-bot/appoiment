import { route, zId } from "@/server/http";
import { deleteAddress } from "@/server/services/account";

export const DELETE = route<{ id: string }>({ auth: true }, async ({ viewer, params }) => deleteAddress(viewer, zId.parse(params.id)));
