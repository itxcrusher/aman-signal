import type { MetadataRoute } from "next";

/**
 * Installable, because permissions are the point.
 *
 * A browser grants location and microphone per origin and remembers the answer, so
 * asking once at install means an emergency report costs no prompts and no taps. An
 * app asked for the first time while someone is standing in water gets refused, and
 * a refusal is sticky.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AmanSignal",
    short_name: "AmanSignal",
    description: "Report a flood emergency in Urdu, Roman Urdu or English.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f7f5",
    theme_color: "#0b5d53",
    lang: "ur",
    dir: "rtl",
    categories: ["utilities", "social"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
