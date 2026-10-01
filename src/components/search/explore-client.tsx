"use client";

import { List, Map as MapIcon, Search, SlidersHorizontal, X } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BusinessCard, BusinessCardSkeleton, type CardBusiness } from "@/components/business/business-card";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { SavedLocation } from "@/lib/location";
import { LocationPicker } from "./location-picker";

const ResultsMap = dynamic(() => import("./results-map"), { ssr: false, loading: () => <div className="skeleton size-full" /> });

type Result = CardBusiness & { lat: number | null; lng: number | null };
type Category = { slug: string; name: string; children: { slug: string; name: string }[] };

const QUICK = [
  { key: "availableToday", label: "Available today" },
  { key: "instant", label: "Instant booking" },
  { key: "mobile", label: "Comes to you" },
  { key: "virtual", label: "Online" },
] as const;

export function ExploreClient({
  initial,
  hasMoreInitial,
  categories,
  favorites,
  signedIn,
  location,
}: {
  initial: Result[];
  hasMoreInitial: boolean;
  categories: Category[];
  favorites: string[];
  signedIn: boolean;
  location: SavedLocation | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(hasMoreInitial);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState<"list" | "map">(params.get("view") === "map" ? "map" : "list");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [q, setQ] = useState(params.get("q") ?? "");
  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const listRef = useRef<HTMLDivElement>(null);

  // New server results (after a filter change) replace the list.
  useEffect(() => {
    setItems(initial);
    setHasMore(hasMoreInitial);
    setPage(1);
  }, [initial, hasMoreInitial]);

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "" || v === "false") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = new URLSearchParams(params.toString());
      next.set("page", String(page + 1));
      const res = await api<{ results: Result[]; hasMore: boolean }>(`/api/search?${next}`);
      setItems((prev) => [...prev, ...res.results.filter((r) => !prev.some((p) => p.id === r.id))]);
      setHasMore(res.hasMore);
      setPage((p) => p + 1);
    } finally {
      setLoadingMore(false);
    }
  }

  function selectFromMap(id: string) {
    setActiveId(id);
    document.getElementById(`result-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  const activeFilters = ["minRating", "maxPrice", "kind", "availableToday", "instant", "mobile", "virtual"].filter((k) => params.get(k)).length;
  const category = params.get("category");
  const center: [number, number] | null = params.get("lat") && params.get("lng") ? [Number(params.get("lat")), Number(params.get("lng"))] : location ? [location.lat, location.lng] : null;
  const locValue: SavedLocation | null = params.get("lat") ? { label: params.get("near") ?? "Selected area", lat: Number(params.get("lat")), lng: Number(params.get("lng")) } : null;
  const heading = category ? (categories.flatMap((c) => [c, ...c.children]).find((c) => c.slug === category)?.name ?? "Results") : params.get("q") ? `“${params.get("q")}”` : "Explore";

  return (
    <div className="mx-auto max-w-[1600px]">
      {/* Search bar */}
      <div className="sticky top-16 z-30 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <form
            className="flex h-11 flex-1 items-center rounded-lg border border-line-strong bg-surface shadow-sm lg:max-w-2xl"
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: q.trim() || null });
            }}
            role="search"
          >
            <label className="flex h-full flex-1 items-center gap-2 px-3">
              <Search className="size-4 text-ink-3" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services or professionals" aria-label="Search" className="h-full min-w-0 flex-1 bg-transparent text-[15px] focus:outline-none md:text-sm" />
              {q && (
                <button type="button" onClick={() => { setQ(""); update({ q: null }); }} aria-label="Clear search" className="text-ink-3 hover:text-ink">
                  <X className="size-4" />
                </button>
              )}
            </label>
            <span className="h-6 w-px bg-line" aria-hidden />
            <LocationPicker
              compact
              value={locValue}
              onChange={(l) => update(l ? { lat: String(l.lat), lng: String(l.lng), near: l.label, radiusKm: params.get("radiusKm") ?? "25" } : { lat: null, lng: null, near: null, radiusKm: null })}
              className="h-full w-40 px-3 sm:w-52"
            />
          </form>
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
            <Button variant="secondary" size="sm" onClick={() => setFiltersOpen(true)} icon={<SlidersHorizontal className="size-4" />} className="shrink-0">
              Filters{activeFilters ? ` · ${activeFilters}` : ""}
            </Button>
            {QUICK.map((f) => {
              const on = params.get(f.key) === "true";
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update({ [f.key]: on ? null : "true" })}
                  className={cn("h-8 shrink-0 rounded-md border px-3 text-[13px] font-medium transition-colors", on ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-2 hover:text-ink")}
                >
                  {f.label}
                </button>
              );
            })}
            <div className="ml-auto hidden shrink-0 lg:block">
              <Segmented
                label="View"
                size="sm"
                value={view}
                onChange={(v) => setView(v)}
                options={[
                  { value: "list", label: <span className="inline-flex items-center gap-1.5"><List className="size-3.5" />List</span> },
                  { value: "map", label: <span className="inline-flex items-center gap-1.5"><MapIcon className="size-3.5" />Map</span> },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={cn("px-4 pt-6 sm:px-6 lg:px-8", view === "map" && "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-6 lg:pr-0")}>
        <div>
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl leading-tight tracking-[-0.01em] text-ink sm:text-4xl">{heading}</h1>
              <p className="mt-1 text-sm text-ink-3" aria-live="polite">
                {pending ? "Updating…" : `${items.length}${hasMore ? "+" : ""} ${items.length === 1 ? "professional" : "professionals"}${locValue ? ` near ${locValue.label === "Current location" ? "you" : locValue.label}` : ""}`}
              </p>
            </div>
            <Select aria-label="Sort by" value={params.get("sort") ?? "relevance"} onChange={(e) => update({ sort: e.target.value === "relevance" ? null : e.target.value })} className="h-9 w-auto text-sm">
              <option value="relevance">Best match</option>
              <option value="rating">Highest rated</option>
              <option value="price">Lowest price</option>
              {center && <option value="distance">Nearest</option>}
            </Select>
          </div>

          {/* Category row */}
          <nav aria-label="Categories" className="-mx-4 mb-6 flex gap-5 overflow-x-auto border-b border-line px-4 scrollbar-none sm:mx-0 sm:px-0">
            <button type="button" onClick={() => update({ category: null })} className={cn("-mb-px shrink-0 border-b-2 pb-3 text-sm font-medium", !category ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
              All
            </button>
            {categories.map((c) => (
              <button key={c.slug} type="button" onClick={() => update({ category: c.slug })} className={cn("-mb-px shrink-0 border-b-2 pb-3 text-sm font-medium", category === c.slug || c.children.some((x) => x.slug === category) ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
                {c.name}
              </button>
            ))}
          </nav>

          <div ref={listRef} className={cn("transition-opacity", pending && "opacity-50")}>
            {items.length === 0 ? (
              <EmptyState
                icon={<Search />}
                title="No matches yet"
                description={params.get("q") ? "Try a broader term, a different spelling, or remove some filters." : "Try removing a filter or searching a wider area."}
                action={
                  <Button variant="secondary" onClick={() => startTransition(() => router.replace(pathname))}>
                    Clear all filters
                  </Button>
                }
              />
            ) : (
              <div className={cn("grid gap-x-6 gap-y-10 sm:grid-cols-2", view === "map" ? "xl:grid-cols-2" : "lg:grid-cols-3 2xl:grid-cols-4")}>
                {items.map((b, i) => (
                  <div key={b.id} id={`result-${b.id}`} onMouseEnter={() => setActiveId(b.id)} className={cn("rounded-xl transition-shadow", view === "map" && activeId === b.id && "ring-2 ring-ink ring-offset-4 ring-offset-bg")}>
                    <BusinessCard b={b} favorite={favSet.has(b.id)} signedIn={signedIn} priority={i < 3} />
                  </div>
                ))}
                {loadingMore && Array.from({ length: 3 }, (_, i) => <BusinessCardSkeleton key={i} />)}
              </div>
            )}
            {hasMore && !loadingMore && (
              <div className="mt-12 flex justify-center">
                <Button variant="secondary" onClick={loadMore}>
                  Show more
                </Button>
              </div>
            )}
          </div>
        </div>

        {view === "map" && (
          <div className="fixed inset-0 top-16 z-20 bg-bg lg:sticky lg:top-[134px] lg:z-0 lg:h-[calc(100dvh-150px)] lg:overflow-hidden lg:rounded-l-xl lg:border lg:border-r-0 lg:border-line">
            <ResultsMap items={items} activeId={activeId} onSelect={selectFromMap} center={center} />
            {/* Phone: selected card floats above the map */}
            {activeId && (
              <div className="absolute inset-x-4 bottom-24 z-[500] rounded-xl bg-surface p-3 shadow-lg lg:hidden">
                {(() => {
                  const b = items.find((x) => x.id === activeId);
                  return b ? <BusinessCard b={b} favorite={favSet.has(b.id)} signedIn={signedIn} /> : null;
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Phone map/list toggle */}
      <button
        type="button"
        onClick={() => setView(view === "map" ? "list" : "map")}
        className="fixed bottom-24 left-1/2 z-30 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-bg shadow-lg lg:hidden"
      >
        {view === "map" ? <List className="size-4" /> : <MapIcon className="size-4" />}
        {view === "map" ? "List" : "Map"}
      </button>

      <Dialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filters"
        footer={
          <>
            <Button variant="ghost" onClick={() => { update({ minRating: null, maxPrice: null, kind: null, availableToday: null, instant: null, mobile: null, virtual: null, radiusKm: null }); setFiltersOpen(false); }}>
              Clear all
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>Show results</Button>
          </>
        }
      >
        <div className="space-y-7 pb-2">
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-ink">Availability & booking</legend>
            <div className="space-y-1">
              {QUICK.map((f) => (
                <Checkbox key={f.key} checked={params.get(f.key) === "true"} onCheckedChange={(v) => update({ [f.key]: v ? "true" : null })} label={f.label} />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-ink">Rating</legend>
            <Segmented
              label="Minimum rating"
              value={params.get("minRating") ?? "any"}
              onChange={(v) => update({ minRating: v === "any" ? null : v })}
              options={[{ value: "any", label: "Any" }, { value: "4", label: "4+" }, { value: "4.5", label: "4.5+" }]}
            />
          </fieldset>
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-ink">Starting price up to</legend>
            <Segmented
              label="Maximum starting price"
              value={params.get("maxPrice") ?? "any"}
              onChange={(v) => update({ maxPrice: v === "any" ? null : v })}
              options={[{ value: "any", label: "Any" }, { value: "3000", label: "$30" }, { value: "6000", label: "$60" }, { value: "12000", label: "$120" }]}
            />
          </fieldset>
          {center && (
            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-ink">Distance</legend>
              <Segmented
                label="Distance"
                value={params.get("radiusKm") ?? "25"}
                onChange={(v) => update({ radiusKm: v })}
                options={[{ value: "5", label: "5 km" }, { value: "10", label: "10 km" }, { value: "25", label: "25 km" }, { value: "50", label: "50 km" }]}
              />
            </fieldset>
          )}
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-ink">Provider</legend>
            <Segmented
              label="Provider type"
              value={params.get("kind") ?? "any"}
              onChange={(v) => update({ kind: v === "any" ? null : v })}
              options={[{ value: "any", label: "Any" }, { value: "individual", label: "Independent pros" }, { value: "business", label: "Businesses & teams" }]}
            />
          </fieldset>
        </div>
      </Dialog>
    </div>
  );
}

export function ExploreSkeleton() {
  return (
    <div className="mx-auto grid max-w-[1600px] gap-x-6 gap-y-10 px-4 pt-28 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8 2xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <BusinessCardSkeleton key={i} />
      ))}
    </div>
  );
}
