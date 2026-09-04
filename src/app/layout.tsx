import type { Metadata, Viewport } from "next";
import { Sora, Fraunces, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Display faces for the three built-in "suasana" (mood) presets — see
// lib/ui-moods.ts and globals.css's SUASANA block. Loaded once here (not
// per-mood at runtime) and exposed as CSS variables so the actual face
// swap is a CSS var lookup scoped to `[data-mood]`, not a conditional font
// load — small fixed cost, no layout-shift risk when a user switches moods.
const sora = Sora({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-operations-deck" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["600"], style: ["italic"], variable: "--font-vision-glass" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-aurora-glass" });

export const metadata: Metadata = {
  title: { default: "SSO Connect", template: "%s · SSO Connect" },
  description: "Sales, Finance, Project & Document management for PT Sarana Sinergi Optima",
  // iOS Safari ignores the web manifest for "add to home screen" styling —
  // it needs these Apple-specific tags to launch standalone (no browser
  // chrome) with its own icon and title. Android/desktop Chrome read the
  // manifest.ts file instead; both are wired so every team member gets an
  // app-like install regardless of phone.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SSO Connect",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1F3864",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${sora.variable} ${fraunces.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
