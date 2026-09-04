import "@/lib/silenceExpoGoPushWarning";

import { ClerkProvider, useAuth } from "@clerk/expo";
import { Pressable, Text, View } from "react-native";
import { tokenCache } from "@clerk/expo/token-cache";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { Stack } from "expo-router";
import * as Notifications from "expo-notifications";
import { ensureDefaultReminders } from "@/lib/notifications";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AnimatedSplash } from "@/components/AnimatedSplash";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PendingMobileLink } from "@/components/PendingMobileLink";
import { PendingUsernameLink } from "@/components/PendingUsernameLink";
import { useColors } from "@/hooks/useColors";
import { GuestProvider } from "@/hooks/useGuest";
import { AuthClientResetContext } from "@/hooks/useAuthClientReset";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";

SplashScreen.preventAutoHideAsync();

// Cache-first data loading: screens render instantly from the last known data
// (persisted to device storage across app launches) while a background refetch
// keeps things fresh. staleTime avoids refetch storms when hopping between tabs.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
    },
  },
});

const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "iconic-query-cache",
  throttleTime: 2000,
});

// Only PUBLIC catalog-style content is ever written to device storage —
// anything personal (profile, orders, bookings, notifications, wallet…)
// stays in memory only, so nothing private can leak to the next person
// who opens the app on a shared phone.
const PUBLIC_PERSIST_PREFIXES = [
  "/api/gyms",
  "/api/classes",
  "/api/trainers",
  "/api/memberships",
  "/api/package-categories",
  "/api/membership-packages",
  "/api/store/products",
  "/api/store/categories",
  "/api/home-slides",
  "/api/faq",
  "/api/links",
];

function isPublicPersistableQuery(query: { queryKey: readonly unknown[] }): boolean {
  const first = query.queryKey[0];
  return (
    typeof first === "string" &&
    PUBLIC_PERSIST_PREFIXES.some(
      (p) => first === p || first.startsWith(`${p}/`) || first.startsWith(`${p}?`),
    )
  );
}

// Point generated API hooks at the remote GYMCO backend (same domain, /api).
// EAS cloud builds don't set EXPO_PUBLIC_DOMAIN, so fall back to the published
// production domain — never an old/stale deployment.
const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "iconicfitnessindia.com";
const apiBaseUrl = `https://${domain}`;
setBaseUrl(apiBaseUrl);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type AuthConfig = {
  publishableKey: string;
  proxyUrl?: string;
};

// Supply the Clerk session token as a bearer to every generated API call,
// at the root so all routes (tabs + root-level modals) are covered.
function ApiAuthBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}

function RootLayoutNav() {
  const colors = useColors();
  const { scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="exercise/[slug]" />
        <Stack.Screen name="workout/[id]" />
        <Stack.Screen name="workout/generate" />
        <Stack.Screen name="meal-plan/[id]" />
        <Stack.Screen name="trainer/[id]" />
        <Stack.Screen
          name="book-trainer"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen name="package/[id]" />
        <Stack.Screen name="challenge/[id]" />
        <Stack.Screen
          name="web"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="notifications"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="invoices"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="water"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="diet"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="workouts"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="body"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="meal-plans"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="habits"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="trainers"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="challenges"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="coach"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="plans"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="refer"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="pt-details"
          options={{ presentation: "modal", headerShown: false }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [splashDone, setSplashDone] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [authConfigFailed, setAuthConfigFailed] = useState(false);
  const [authConfigRetry, setAuthConfigRetry] = useState(0);
  const [authClientKey, setAuthClientKey] = useState(0);
  const resetAuthClient = useCallback(() => {
    setAuthClientKey((current) => current + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    setAuthConfigFailed(false);

    void fetch(`${apiBaseUrl}/api/auth/config`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Auth config request failed: ${response.status}`);
        }
        const config = (await response.json()) as {
          publishableKey?: unknown;
          proxyPath?: unknown;
        };
        if (
          typeof config.publishableKey !== "string" ||
          !config.publishableKey
        ) {
          throw new Error("Auth config did not include a publishable key");
        }
        const proxyPath =
          typeof config.proxyPath === "string" ? config.proxyPath : "";
        if (active) {
          setAuthConfig({
            publishableKey: config.publishableKey,
            proxyUrl: proxyPath ? `${apiBaseUrl}${proxyPath}` : undefined,
          });
          setAuthConfigFailed(false);
        }
      })
      .catch(() => {
        if (active) {
          setAuthConfigFailed(true);
        }
      });

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [authConfigRetry]);

  // Hide the native splash as soon as fonts resolve — but NEVER wait on them
  // forever. If the font download stalls (slow device / blocked tunnel), a 2s
  // fail-safe hides the splash anyway so the app always reveals its UI.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 2000);
    return () => clearTimeout(t);
  }, [fontsLoaded, fontError]);

  // Fail-safe: never let the animated splash trap the user, even if the
  // Reanimated completion callback doesn't fire (web/reduced-motion edge cases).
  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 3000);
    return () => clearTimeout(t);
  }, []);

  // Daily action reminders are ON by default — keep them scheduled on every
  // launch unless the user explicitly turned them off in Settings.
  useEffect(() => {
    void ensureDefaultReminders();
  }, []);

  // A build without a usable Clerk configuration must not hard-crash. EAS
  // builds obtain it from the API above because they do not inherit Replit
  // deployment environment variables.
  if (!authConfig) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          backgroundColor: "#0B0B0F",
        }}
      >
        <Text
          style={{
            color: "#fff",
            fontSize: 16,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          {authConfigFailed
            ? "Could not connect to login"
            : "Connecting to secure login…"}
        </Text>
        <Text
          style={{
            color: "#9CA3AF",
            fontSize: 13,
            textAlign: "center",
            marginTop: 8,
          }}
        >
          {authConfigFailed
            ? "Check your internet connection, close the app, and open it again."
            : "Please wait a moment."}
        </Text>
        {authConfigFailed ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setAuthConfigRetry((attempt) => attempt + 1)}
            style={{
              marginTop: 20,
              borderRadius: 12,
              backgroundColor: "#0BE607",
              paddingHorizontal: 24,
              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                color: "#071006",
                fontSize: 15,
                fontWeight: "700",
              }}
            >
              Try again
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  // IMPORTANT: do NOT gate the whole app on font loading (`return null`). Doing
  // so leaves a permanent blank screen if the font assets are slow to download
  // on a real device. We render immediately and let Inter swap in when ready;
  // the system font is a perfectly fine fallback for the first moment.

  return (
    // NOTE: we intentionally do NOT wrap the app in <ClerkLoaded>. Gating the
    // whole tree on Clerk finishing its network load means a slow/blocked auth
    // request on a real device traps the user on a blank screen after the splash
    // (and even blocks guests from reaching "Continue without login"). Instead we
    // always render the app and let each route handle the auth-loading state.
    <AuthClientResetContext.Provider value={resetAuthClient}>
      <ClerkProvider
        key={authClientKey}
        publishableKey={authConfig.publishableKey}
        tokenCache={tokenCache}
        {...(authConfig.proxyUrl ? { proxyUrl: authConfig.proxyUrl } : {})}
      >
        <SafeAreaProvider>
          <ThemeProvider>
            <ErrorBoundary>
              <PersistQueryClientProvider
                client={queryClient}
                persistOptions={{
                  persister: queryPersister,
                  maxAge: 24 * 60 * 60 * 1000,
                  buster: "v2",
                  dehydrateOptions: {
                    shouldDehydrateQuery: (query) =>
                      query.state.status === "success" &&
                      isPublicPersistableQuery(query),
                  },
                }}
              >
                <ApiAuthBridge />
                <PendingMobileLink />
                <PendingUsernameLink />
                <GuestProvider>
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <RootLayoutNav />
                    {!splashDone ? (
                      <AnimatedSplash onFinish={() => setSplashDone(true)} />
                    ) : null}
                  </GestureHandlerRootView>
                </GuestProvider>
              </PersistQueryClientProvider>
            </ErrorBoundary>
          </ThemeProvider>
        </SafeAreaProvider>
      </ClerkProvider>
    </AuthClientResetContext.Provider>
  );
}
