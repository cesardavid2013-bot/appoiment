import { z } from "zod";
import { proRoute, readJson } from "@/server/http";
import { portfolioUpdateSchema, removePortfolioItem, updatePortfolioItem } from "@/server/services/portfolio";

export const PUT = proRoute<{ id: string }>("portfolio.manage", async ({ req, viewer, m, params }) => {
  await updatePortfolioItem(m, viewer.id, z.string().uuid().parse(params.id), await readJson(req, portfolioUpdateSchema));
  return { ok: true };
});
export const DELETE = proRoute<{ id: string }>("portfolio.manage", async ({ viewer, m, params }) => {
  await removePortfolioItem(m, viewer.id, z.string().uuid().parse(params.id));
  return { ok: true };
});
