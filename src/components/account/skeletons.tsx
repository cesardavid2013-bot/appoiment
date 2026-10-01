import { Skeleton } from "@/components/ui/misc";
import { getT } from "@/i18n/server";

/** Route-level loading placeholders that mirror the real page layouts. */
export async function ListPageSkeleton({ rows = 5, width = "max-w-2xl" }: { rows?: number; width?: string }) {
  const t = await getT("account");
  return (
    <div className={`mx-auto ${width} px-4 pt-10 sm:px-6`} aria-busy="true">
      <span className="sr-only" role="status">
        {t("loading")}
      </span>
      <Skeleton className="h-10 w-48" />
      <div className="mt-8 divide-y divide-line rounded-xl border border-line bg-surface">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3.5 px-4 py-4 sm:px-5">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function SettingsPageSkeleton() {
  const t = await getT("account");
  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12 lg:px-8 lg:pt-12" aria-busy="true">
      <span className="sr-only" role="status">
        {t("loading")}
      </span>
      <div className="hidden space-y-2 lg:block">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
      <div className="max-w-2xl">
        <Skeleton className="mt-14 h-10 w-56 lg:mt-0" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
        <Skeleton className="mt-8 h-56 w-full rounded-xl" />
        <Skeleton className="mt-6 h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}
