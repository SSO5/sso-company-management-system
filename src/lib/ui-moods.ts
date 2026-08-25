/**
 * "Suasana" — a personal, self-service visual skin picked per-user (User.
 * uiMood), independent of Settings > Tema (CompanySettings.themePreset,
 * Admin-only, company-wide accent color). Each mood is a self-contained
 * look: background, glass-card treatment, accent, and display font. Picking
 * one never affects what a colleague sees. "default" keeps today's exact
 * app appearance untouched.
 */
export interface UiMood {
  id: string;
  label: string;
  tagline: string;
  swatch: string; // hex, for the picker UI
}

export const UI_MOODS: UiMood[] = [
  { id: "default", label: "Default", tagline: "Tampilan standar SSO Connect", swatch: "#1c2b4a" },
  { id: "operations-deck", label: "Operations Deck", tagline: "Gelap, industrial, kaca di atas foto workshop", swatch: "#5ab6ff" },
  { id: "vision-glass", label: "Vision Glass", tagline: "Terang, hangat, kaca lembut di atas bokeh", swatch: "#e07b2e" },
  { id: "aurora-glass", label: "Aurora Glass", tagline: "Gelap, vivid, kaca dengan aksen neon", swatch: "#a855f7" },
];

export function getUiMood(id: string | null | undefined): UiMood {
  return UI_MOODS.find((m) => m.id === id) ?? UI_MOODS[0];
}
