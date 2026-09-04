import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { useColorScheme as useDeviceColorScheme } from "react-native";

export type ThemeMode = "light" | "dark" | "system";
export type ColorScheme = "light" | "dark";

type ThemeContextValue = {
  /** User preference: explicit light/dark, or follow the device. */
  mode: ThemeMode;
  /** The resolved scheme actually applied to the UI. */
  scheme: ColorScheme;
  setMode: (mode: ThemeMode) => void;
  /** Flip between light and dark (sets an explicit preference). */
  toggle: () => void;
};

const STORAGE_KEY = "iconic.themeMode";

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const device = useDeviceColorScheme();
  // Brand default is always the black theme. Users can explicitly switch to
  // light (or follow the device) from Appearance settings.
  const [mode, setModeState] = useState<ThemeMode>("dark");

  // Restore the saved preference on first mount.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === "light" || value === "dark" || value === "system") {
          setModeState(value);
        }
      })
      .catch(() => {
        // Storage unavailable — keep the default ("dark").
      });
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Persisting the preference failed; the in-memory choice still applies.
    });
  };

  const scheme: ColorScheme =
    mode === "system" ? (device === "dark" ? "dark" : "light") : mode;

  const toggle = () => setMode(scheme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ mode, scheme, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Safe fallback if a consumer renders outside the provider.
    return {
      mode: "system",
      scheme: "dark",
      setMode: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}
