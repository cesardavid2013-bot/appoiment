"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { formatMoney } from "@/domain/money";
import type { CardBusiness } from "@/components/business/business-card";

const TILE = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "© OpenStreetMap contributors";

function pin(label: string, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<div style="transform:translate(-50%,-100%);display:inline-flex;align-items:center;height:28px;padding:0 10px;border-radius:14px;font:600 12px/1 var(--font-ui),system-ui;white-space:nowrap;box-shadow:0 2px 8px rgb(0 0 0 / .18);background:${active ? "var(--ink)" : "var(--surface)"};color:${active ? "var(--bg)" : "var(--ink)"};border:1px solid ${active ? "var(--ink)" : "var(--line-strong)"};transition:all .15s">${label}</div>`,
    iconSize: [0, 0],
  });
}

function Fit({ points, center }: { points: [number, number][]; center: [number, number] | null }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 15 });
    else if (points.length === 1) map.setView(points[0], 14);
    else if (center) map.setView(center, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export default function ResultsMap({ items, activeId, onSelect, center }: { items: CardBusiness[]; activeId: string | null; onSelect: (id: string) => void; center: [number, number] | null }) {
  const located = useMemo(() => items.filter((b): b is CardBusiness & { lat: number; lng: number } => (b as { lat?: number | null }).lat != null && (b as { lng?: number | null }).lng != null), [items]);
  const points = located.map((b) => [b.lat, b.lng] as [number, number]);
  const ref = useRef<L.Map | null>(null);
  return (
    <MapContainer ref={ref} center={center ?? points[0] ?? [40.7128, -74.006]} zoom={12} scrollWheelZoom className="size-full" attributionControl>
      <TileLayer url={TILE} attribution={ATTR} />
      <Fit points={points} center={center} />
      {located.map((b) => (
        <Marker
          key={b.id}
          position={[b.lat, b.lng]}
          icon={pin(b.priceMinCents != null ? (b.priceMinCents === 0 ? "Free" : formatMoney(b.priceMinCents, b.currency, { compact: true })) : b.name.split(" ")[0], activeId === b.id)}
          zIndexOffset={activeId === b.id ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(b.id) }}
          title={b.name}
          keyboard
        />
      ))}
    </MapContainer>
  );
}
