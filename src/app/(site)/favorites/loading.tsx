import { BusinessCardSkeleton } from "@/components/business/business-card";
import { Skeleton } from "@/components/ui/misc";
import { getT } from "@/i18n/server";

export default async function Loading() {
  const t = await getT("account");
  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8" aria-busy="true">
      <span className="sr-only" role="status">
        {t("saved.loading")}
      </span>
      <Skeleton className="h-10 w-32" />
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <BusinessCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
