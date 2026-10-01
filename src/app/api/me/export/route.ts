import { route } from "@/server/http";
import { exportMyData } from "@/server/services/account";

/** Downloads a JSON copy of the signed-in user's personal data. */
export const GET = route({ auth: true }, async ({ viewer }) => {
  const data = await exportMyData(viewer);
  const date = data.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="kept-data-${date}.json"`,
      "cache-control": "no-store",
    },
  });
});
