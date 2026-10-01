import type { MetadataRoute } from "next";

/** Makes Kept installable on Android, iPhone ("Add to Home Screen"), Windows, ChromeOS and Mac (Chrome/Safari). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Kept",
    short_name: "Kept",
    description: "Book trusted professionals and run your appointments.",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f2ea",
    theme_color: "#0e0d0b",
    categories: ["lifestyle", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My bookings", url: "/bookings", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Explore", url: "/explore", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Business today", url: "/pro/today", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
