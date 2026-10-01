import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { ProfileSettings } from "@/components/pro/profile-settings";
import { SettingsShell } from "@/components/pro/settings-shell";
import { db } from "@/server/db/client";
import { businesses } from "@/server/db/schema";
import { proPage } from "@/server/pro-page";
import { listCategories } from "@/server/services/catalog";
import { getMediaMap } from "@/server/services/media";

export const metadata: Metadata = { title: "Business profile" };

export default async function ProfileSettingsPage() {
  const { m } = await proPage("business.manage");
  const [[b], categories] = await Promise.all([db.select().from(businesses).where(eq(businesses.id, m.businessId)), listCategories()]);
  const media = await getMediaMap([b.logoMediaId, b.coverMediaId]);
  return (
    <SettingsShell title="Business profile" description="What clients see on your page and in search." perms={[...m.permissions]}>
      <ProfileSettings
        businessId={b.id}
        slug={b.slug}
        live={b.status === "active"}
        kind={b.kind}
        categories={categories.map((c) => ({ id: c.id, name: c.name, children: c.children.map((x) => ({ id: x.id, name: x.name })) }))}
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
