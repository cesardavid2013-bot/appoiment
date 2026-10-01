import { Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-button";
import { AdminHeader, FilterForm, FilterTabs, flatParams, Pager, pageParam, Panel, StatusBadge, Table, TBody, Td, Th, THead, Tr, When } from "@/components/admin/ui";
import { Badge, EmptyState, Stars } from "@/components/ui/misc";
import { requireAdminPage } from "@/server/admin-guard";
import { listReviews } from "@/server/services/admin";

export const metadata: Metadata = { title: "Reviews" };

const PATH = "/admin/reviews";

const OPTIONS = {
  published: { value: "published", label: "Publish (restore)", description: "Visible on the profile and counted in ratings." },
  hidden: { value: "hidden", label: "Hide", description: "Hidden from the profile and ratings; can be restored later." },
  removed: { value: "removed", label: "Remove", description: "Removed from the profile and ratings for policy violations." },
};

export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  await requireAdminPage("admin");
  const params = flatParams(await searchParams);
  const rating = Number(params.rating);
  const res = await listReviews({ status: params.status, q: params.q, rating: Number.isInteger(rating) ? rating : undefined, page: pageParam(params.page) });

  return (
    <>
      <AdminHeader title="Reviews" description="Verified reviews from completed appointments. Hiding or removing a review recalculates the business rating and closes open reports on it." />
      <div className="mb-4 space-y-3">
        <FilterTabs
          path={PATH}
          params={params}
          name="status"
          value={res.status}
          label="Review status"
          options={[
            { value: "all", label: "All" },
            { value: "reported", label: "Reported" },
            { value: "published", label: "Published" },
            { value: "hidden", label: "Hidden" },
            { value: "removed", label: "Removed" },
          ]}
        />
        <FilterForm
          path={PATH}
          params={params}
          keep={["status"]}
          q={{ label: "Search reviews" }}
          placeholder="Business, customer email or text"
          selects={[
            {
              name: "rating",
              label: "Rating",
              options: [{ value: "", label: "Any rating" }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? "" : "s"}` }))],
            },
          ]}
        />
      </div>

      <Panel>
        {res.items.length === 0 ? (
          <EmptyState icon={<Star />} title="No reviews match" description="Try another filter." />
        ) : (
          <Table label="Reviews" className="[&_table]:min-w-[860px]">
            <THead>
              <Th className="w-[40%]">Review</Th>
              <Th>Business</Th>
              <Th>Customer</Th>
              <Th>Status</Th>
              <Th>Posted</Th>
              <Th />
            </THead>
            <TBody>
              {res.items.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Stars value={r.rating} size={12} />
                    {r.body ? <p className="mt-1 line-clamp-4 text-sm leading-relaxed text-ink-2">{r.body}</p> : <p className="mt-1 text-[13px] text-ink-3">No text</p>}
                    {r.responseBody && <p className="mt-1.5 line-clamp-2 border-s-2 border-line ps-2 text-[13px] text-ink-3">Reply: {r.responseBody}</p>}
                  </Td>
                  <Td>
                    <Link href={`/admin/businesses/${r.businessId}`} className="hover:underline">
                      {r.businessName}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/admin/users/${r.customerId}`} className="hover:underline">
                      {r.customerName}
                    </Link>
                    <div className="max-w-[200px] truncate text-[13px] text-ink-3">{r.customerEmail}</div>
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge value={r.status} />
                      {r.openReports > 0 && (
                        <Link href="/admin/reports?target=review">
                          <Badge tone="negative">
                            {r.openReports} report{r.openReports === 1 ? "" : "s"}
                          </Badge>
                        </Link>
                      )}
                    </div>
                  </Td>
                  <Td className="text-ink-2">
                    <When at={r.createdAt} />
                  </Td>
                  <Td align="right">
                    <ActionButton
                      endpoint={`/api/admin/reviews/${r.id}/status`}
                      label="Moderate"
                      variant="ghost"
                      title="Moderate review"
                      description={`${r.rating}★ review of ${r.businessName} by ${r.customerName}.`}
                      confirmLabel="Save"
                      choice={{
                        name: "status",
                        label: "Change to",
                        options: (["hidden", "removed", "published"] as const).filter((s) => s !== r.status).map((s) => OPTIONS[s]),
                      }}
                      note={{ name: "note", label: "Note", hint: "Internal — recorded in the audit log." }}
                      success="Review updated"
                    />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        <Pager path={PATH} params={params} page={res.page} hasMore={res.hasMore} />
      </Panel>
    </>
  );
}
