/**
 * Named, pre-designed color palettes for Settings > Tema (CompanySettings.
 * themePreset). Only the brand/primary color varies between presets —
 * success/warning/destructive stay fixed across all of them on purpose:
 * those are semantic status colors used everywhere (OVERDUE badges, At Risk
 * flags, Approved states), and letting a theme pick shift them would make
 * "red = problem" stop meaning the same thing depending on which palette is
 * active. Values are HSL triples (matching globals.css's `--primary: H S% L%`
 * format) so they drop straight into a CSS custom property.
 */
export interface ThemePreset {
  id: string;
  label: string;
  primary: string; // "H S% L%"
  ring: string; // "H S% L%" — slightly lighter than primary, matches globals.css's default relationship
  swatch: string; // hex, for the picker UI only
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "navy", label: "Navy (Default)", primary: "222 47% 20%", ring: "222 47% 40%", swatch: "#1c2b4a" },
  { id: "slate", label: "Slate", primary: "215 25% 27%", ring: "215 25% 45%", swatch: "#334255" },
  { id: "forest", label: "Hijau Tua", primary: "150 35% 18%", ring: "150 35% 34%", swatch: "#1b3a2c" },
  { id: "maroon", label: "Maroon", primary: "350 45% 24%", ring: "350 45% 42%", swatch: "#552430" },
];

export function getThemePreset(id: string | null | undefined): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0];
}
