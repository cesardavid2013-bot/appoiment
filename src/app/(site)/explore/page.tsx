import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { ExploreClient, ExploreSkeleton } from "@/components/search/explore-client";
import { categoryName } from "@/i18n/helpers";
import { getT } from "@/i18n/server";
import { LOCATION_COOKIE, parseLocationCookie } from "@/lib/location";
import { getViewer } from "@/server/auth/session";
import { listCategories } from "@/server/services/catalog";
import { favoriteIds } from "@/server/services/engagement";
import { searchBusinesses, searchSchema } from "@/server/services/search";

export async function generateMetadata({ searchParams }: PageProps<"/explore">): Promise<Metadata> {
  const [sp, cats, t, tr] = await Promise.all([searchParams, listCategories(), getT("search"), getT()]);
  const cat = cats.flatMap((c) => [c, ...c.children]).find((c) => c.slug === sp.category);
  const title = cat ? t("meta.category", { category: categoryName(tr, cat.slug, cat.name) }) : typeof sp.q === "string" ? t("meta.query", { q: sp.q }) : t("meta.title");
  return { title, description: t("meta.description"), alternates: { canonical: cat ? `/explore?category=${cat.slug}` : "/explore" } };
}

async function Results({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const viewer = await getViewer();
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = searchSchema.safeParse(flat);
  const params = parsed.success ? parsed.data : searchSchema.parse({});
  if (params.lat != null && params.lng != null && !params.radiusKm) params.radiusKm = 25;
  const [res, cats, favs] = await Promise.all([searchBusinesses(params), listCategories(), viewer ? favoriteIds(viewer.id) : Promise.resolve([])]);
  const loc = parseLocationCookie((await cookies()).get(LOCATION_COOKIE)?.value);
  return <ExploreClient initial={res.results} hasMoreInitial={res.hasMore} categories={cats.filter((c) => c.slug !== "other")} favorites={favs} signedIn={Boolean(viewer)} location={loc} />;
}

export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const sp = await searchParams;
  return (
    <Suspense fallback={<ExploreSkeleton />}>
      <Results sp={sp} />
    </Suspense>
  );
}
