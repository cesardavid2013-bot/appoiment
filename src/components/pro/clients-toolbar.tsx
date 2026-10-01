"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Select } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

type Props = { tags: { tag: string; count: number }[]; canSeeSpend: boolean };

/** Search (debounced) + sort + tag filter, all mirrored in the URL so views can be shared and survive reloads. */
export function ClientsToolbar({ tags, canSeeSpend }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, startTransition] = useTransition();
  const lastPushed = useRef(params.get("q") ?? "");

  function go(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    sp.delete("page");
    const qs = sp.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  // Debounce typing into the URL.
  useEffect(() => {
    const value = q.trim();
    if (value === lastPushed.current) return;
    const t = setTimeout(() => {
      lastPushed.current = value;
      go({ q: value || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const sort = params.get("sort") ?? "recent";
  const tag = params.get("tag") ?? "";

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <label htmlFor="client-search" className="sr-only">
          Search clients by name, email or phone
        </label>
        <input
          id="client-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email or phone"
          className="h-11 w-full rounded-md border border-line-strong bg-surface pl-9 pr-10 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 md:h-10 md:text-sm [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
          {pending ? (
            <span className="flex size-9 items-center justify-center text-ink-3">
              <Spinner className="size-4" label="Updating results" />
            </span>
          ) : q ? (
            <button type="button" onClick={() => setQ("")} className="flex size-9 items-center justify-center rounded text-ink-3 hover:text-ink" aria-label="Clear search">
              <X className="size-4" />
            </button>
          ) : null}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:flex">
        {tags.length > 0 && (
          <div>
            <label htmlFor="client-tag" className="sr-only">
              Filter by tag
            </label>
            <Select id="client-tag" value={tag} onChange={(e) => go({ tag: e.target.value || null })} className="sm:w-40">
              <option value="">All tags</option>
              {tags.map((t) => (
                <option key={t.tag} value={t.tag}>
                  {t.tag} ({t.count})
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className={tags.length ? "" : "col-span-2"}>
          <label htmlFor="client-sort" className="sr-only">
            Sort clients
          </label>
          <Select id="client-sort" value={sort} onChange={(e) => go({ sort: e.target.value === "recent" ? null : e.target.value })} className="sm:w-44">
            <option value="recent">Recent visit</option>
            <option value="name">Name A–Z</option>
            <option value="visits">Most visits</option>
            {canSeeSpend && <option value="spent">Total spent</option>}
          </Select>
        </div>
      </div>
    </div>
  );
}
