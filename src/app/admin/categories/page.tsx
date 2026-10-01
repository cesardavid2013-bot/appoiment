import type { Metadata } from "next";
import { CategoryManager } from "@/components/admin/category-manager";
import { AdminHeader } from "@/components/admin/ui";
import { requireAdminPage } from "@/server/admin-guard";
import { listCategoriesAdmin } from "@/server/services/admin";

export const metadata: Metadata = { title: "Categories" };

export default async function AdminCategoriesPage() {
  await requireAdminPage("admin");
  const tree = await listCategoriesAdmin();
  const strip = (c: (typeof tree)[number]["children"][number]) => ({
    id: c.id,
    parentId: c.parentId,
    slug: c.slug,
    name: c.name,
    description: c.description,
    keywords: c.keywords,
    isActive: c.isActive,
    usage: c.usage,
  });
  return (
    <>
      <AdminHeader
        title="Categories"
        description="The service taxonomy customers browse and search. Categories in use can't be deleted — deactivate them so existing listings keep working."
      />
      <CategoryManager tree={tree.map((t) => ({ ...strip(t), children: t.children.map(strip) }))} />
    </>
  );
}
