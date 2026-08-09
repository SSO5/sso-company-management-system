import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SSO Company Management System",
  description: "Sales, Finance, Project & Document management for PT Sarana Sinergi Optima",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
