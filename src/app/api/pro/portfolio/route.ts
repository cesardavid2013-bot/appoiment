import { proRoute, readJson } from "@/server/http";
import { addPortfolioItem, portfolioSchema } from "@/server/services/portfolio";

export const POST = proRoute("portfolio.manage", async ({ req, viewer, m }) => addPortfolioItem(m, viewer.id, await readJson(req, portfolioSchema)));
