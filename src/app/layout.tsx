import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
