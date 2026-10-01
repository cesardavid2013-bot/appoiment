import { Heart } from "lucide-react";
import type { Metadata } from "next";
import { BusinessCard } from "@/components/business/business-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { getT } from "@/i18n/server";
import { favoriteCards } from "@/server/services/customer";
import { requireViewerPage } from "@/server/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("account");
  return { title: t("saved.title"), robots: { index: false } };
}

export default async function FavoritesPage() {
  const viewer = await requireViewerPage("/favorites");
  const [cards, t] = await Promise.all([favoriteCards(viewer.id), getT("account")]);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
      <PageHeader
        title={t("saved.title")}
        description={cards.length ? t("saved.description", { count: cards.length }) : undefined}
      />
      {cards.length === 0 ? (
        <EmptyState
          className="mt-6 rounded-xl border border-dashed border-line-strong"
          icon={<Heart />}
          title={t("saved.emptyTitle")}
          description={t("saved.emptyBody")}
          action={<ButtonLink href="/explore">{t("saved.explore")}</ButtonLink>}
        />
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((b, i) => (
            <li key={b.id} className="flex">
              <BusinessCard b={b} favorite signedIn priority={i < 4} className="w-full" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
