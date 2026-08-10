import type { MetadataRoute } from "next";

/**
 * Next.js App Router auto-serves this at /manifest.webmanifest. Combined
 * with the apple-mobile-web-app meta tags in layout.tsx, this is what makes
 * "Add to Home Screen" (Android Chrome and iOS Safari) launch the app in
 * standalone mode — full screen, its own icon, no browser address bar —
 * instead of just bookmarking a browser tab. No native app store submission
 * needed; every team member installs it straight from the browser.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SSO Connect — Company Management System",
    short_name: "SSO Connect",
    description: "Sales, Finance, Project & Document management for PT Sarana Sinergi Optima",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0B1220",
    theme_color: "#1F3864",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
