import { Heart } from "lucide-react";
import type { Metadata } from "next";
import { BusinessCard } from "@/components/business/business-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { favoriteCards } from "@/server/services/customer";
import { requireViewerPage } from "@/server/viewer";

export const metadata: Metadata = { title: "Saved", robots: { index: false } };

export default async function FavoritesPage() {
  const viewer = await requireViewerPage("/favorites");
  const cards = await favoriteCards(viewer.id);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Saved"
        description={cards.length ? `${cards.length} ${cards.length === 1 ? "professional" : "professionals"} you've saved. Openings below are live from their calendars.` : undefined}
      />
      {cards.length === 0 ? (
        <EmptyState
          className="mt-6 rounded-xl border border-dashed border-line-strong"
          icon={<Heart />}
          title="Nothing saved yet"
          description="Tap the heart on any professional to keep them here — handy for rebooking your regulars or comparing a few before you decide."
          action={<ButtonLink href="/explore">Explore professionals</ButtonLink>}
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
