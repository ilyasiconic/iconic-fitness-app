/**
 * Iconic Fitness — palette built around the Iconic green (logo #7FC240).
 *
 * Two full palettes are defined: `light` (clean, white-based) and `dark`
 * (deep near-black). The active palette is chosen by the ThemeProvider
 * (hooks/useTheme) via useColors(), so the app supports a real light/dark
 * toggle. Both palettes share identical keys so every component just works.
 */

const colors = {
  light: {
    // Legacy aliases
    text: "#1C1C1E",
    tint: "#0BE607",

    // Core surfaces
    background: "#F2F2F7",
    foreground: "#1C1C1E",

    // Cards / elevated surfaces
    card: "#FFFFFF",
    cardForeground: "#1C1C1E",
    elevated: "#FFFFFF",

    // Primary action color (logo green, refined for premium feel)
    primary: "#0BE607",
    primaryForeground: "#0A0C08",

    // Brand button gradient (logo green), used for primary buttons app-wide
    primaryGradient: ["#29E33B", "#10B720"],

    // Secondary surfaces
    secondary: "#E5E5EA",
    secondaryForeground: "#1C1C1E",

    // Muted / subdued
    muted: "#E5E5EA",
    mutedForeground: "#5F5F66",

    // Accent
    accent: "#E5E5EA",
    accentForeground: "#1C1C1E",

    // Destructive
    destructive: "#FF3B30",
    destructiveForeground: "#FFFFFF",

    // Borders / inputs
    border: "#E5E5EA",
    input: "#E5E5EA",

    // Domain accents (rings, charts, badges)
    water: "#32ADE6",
    calorie: "#FF9500",
    protein: "#AF52DE",
    steps: "#34C759",
    success: "#34C759",
    warning: "#FFCC00",
  },

  dark: {
    // Legacy aliases
    text: "#F2F2F7",
    tint: "#0BE607",

    // Core surfaces
    background: "#000000",
    foreground: "#F2F2F7",

    // Cards / elevated surfaces
    card: "#121212",
    cardForeground: "#F2F2F7",
    elevated: "#1C1C1E",

    // Primary action color (bright logo green on dark)
    primary: "#0BE607",
    primaryForeground: "#0A0C08",

    // Brand button gradient (logo green), used for primary buttons app-wide
    primaryGradient: ["#29E33B", "#10B720"],

    // Secondary surfaces
    secondary: "#1C1C1E",
    secondaryForeground: "#EBEBF5",

    // Muted / subdued
    muted: "#1C1C1E",
    mutedForeground: "#8E8E93",

    // Accent
    accent: "#2C2C2E",
    accentForeground: "#0BE607",

    // Destructive
    destructive: "#FF453A",
    destructiveForeground: "#0A0C08",

    // Borders / inputs
    border: "#2C2C2E",
    input: "#1C1C1E",

    // Domain accents (rings, charts, badges)
    water: "#64D2FF",
    calorie: "#FF9F0A",
    protein: "#BF5AF2",
    steps: "#32D74B",
    success: "#30D158",
    warning: "#FFD60A",
  },

  radius: 20,
};

export default colors;
