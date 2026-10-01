"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";

const TILE = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "© OpenStreetMap contributors";
const icon = L.divIcon({
  className: "",
  html: '<div style="transform:translate(-50%,-100%);width:22px;height:22px;border-radius:50% 50% 50% 0;background:var(--ink);rotate:-45deg;border:3px solid var(--surface);box-shadow:0 2px 6px rgb(0 0 0/.3)"></div>',
  iconSize: [0, 0],
});

export default function LocationMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  return (
    <MapContainer center={[lat, lng]} zoom={15} scrollWheelZoom={false} dragging={!L.Browser.mobile} className="size-full" attributionControl>
      <TileLayer url={TILE} attribution={ATTR} />
      <Marker position={[lat, lng]} icon={icon} title={label} />
    </MapContainer>
  );
}
