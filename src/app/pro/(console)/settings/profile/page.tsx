import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { ProfileSettings } from "@/components/pro/profile-settings";
import { SettingsShell } from "@/components/pro/settings-shell";
import { categoryName } from "@/i18n/helpers";
import { getT } from "@/i18n/server";
import { db } from "@/server/db/client";
import { businesses } from "@/server/db/schema";
import { proPage } from "@/server/pro-page";
import { listCategories } from "@/server/services/catalog";
import { getMediaMap } from "@/server/services/media";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSettings");
  return { title: t("profile.title") };
}

export default async function ProfileSettingsPage() {
  const { m } = await proPage("business.manage");
  const [[b], categories, t, rootT] = await Promise.all([db.select().from(businesses).where(eq(businesses.id, m.businessId)), listCategories(), getT("proSettings"), getT()]);
  const media = await getMediaMap([b.logoMediaId, b.coverMediaId]);
  return (
    <SettingsShell title={t("profile.title")} description={t("profile.description")} perms={[...m.permissions]}>
      <ProfileSettings
        businessId={b.id}
        slug={b.slug}
        live={b.status === "active"}
        kind={b.kind}
        categories={categories.map((c) => ({ id: c.id, name: categoryName(rootT, c.slug, c.name), children: c.children.map((x) => ({ id: x.id, name: categoryName(rootT, x.slug, x.name) })) }))}
        initial={{
          name: b.name,
          tagline: b.tagline ?? "",
          about: b.about ?? "",
          primaryCategoryId: b.primaryCategoryId,
          contactEmail: b.contactEmail ?? "",
          contactPhone: b.contactPhone ?? "",
          website: b.website ?? "",
          socialLinks: b.socialLinks ?? {},
          languages: b.languages ?? [],
          amenities: b.amenities ?? [],
          yearsExperience: b.yearsExperience,
          timezone: b.timezone,
          logoMediaId: b.logoMediaId,
          coverMediaId: b.coverMediaId,
        }}
        logo={b.logoMediaId ? (media.get(b.logoMediaId) ?? null) : null}
        cover={b.coverMediaId ? (media.get(b.coverMediaId) ?? null) : null}
      />
    </SettingsShell>
  );
}
