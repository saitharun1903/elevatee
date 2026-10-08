import type { MetadataRoute } from "next";
import { getT } from "@/lib/i18n";

const t = getT();

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: t("brand.name"),
    short_name: t("brand.name"),
    description: t("brand.tagline"),
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f4f2ec",
    theme_color: "#15140f",
    categories: ["productivity", "business", "education"],
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: t("nav.analyze"), url: "/analyze" },
      { name: t("nav.jobs"), url: "/jobs" },
    ],
  };
}
