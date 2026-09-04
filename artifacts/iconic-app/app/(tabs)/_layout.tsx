import { useAuth } from "@clerk/expo";
import { Redirect, Tabs, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabIcon } from "@/components/TabIcon";
import { useColors } from "@/hooks/useColors";
import { useGuest } from "@/hooks/useGuest";

export default function TabsLayout() {
  const colors = useColors();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { isGuest } = useGuest();
  const insets = useSafeAreaInsets();
  // Edge-to-edge Android: the tab bar must clear the system nav bar, or the
  // labels get overlapped/clipped by the gesture/3-button navigation area.
  const bottomInset =
    Platform.OS === "ios" ? 28 : Math.max(insets.bottom, 12);

  // Fail-safe: if Clerk can't finish loading (slow/blocked network on a real
  // device), don't trap the user on a spinner forever — fall through to sign-in,
  // where "Continue without login" is always available.
  const [authTimedOut, setAuthTimedOut] = useState(false);
  useEffect(() => {
    if (isLoaded) return;
    const t = setTimeout(() => setAuthTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, [isLoaded]);

  const hasAccess = isGuest || (isLoaded && isSignedIn);
  if (!hasAccess) {
    if (!isLoaded && !authTimedOut) {
      return (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.background,
          }}
        >
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    return <Redirect href="/(auth)/welcome" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.background === "#000000" || colors.background === "#121212" ? "transparent" : colors.border,
          borderTopWidth: colors.background === "#000000" || colors.background === "#121212" ? 0 : StyleSheet.hairlineWidth,
          height: (Platform.OS === "ios" ? 60 : 64) + bottomInset,
          paddingTop: 8,
          paddingBottom: bottomInset,
          elevation: 0, // Remove android shadow for flatter premium look
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontFamily: "Inter_600SemiBold",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="home" size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="sports"
        options={{
          title: "Branches",
          // Members reach Branches from the More tab — free the slot for
          // Progress; guests keep the Branches tab.
          href: isSignedIn ? null : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="award" size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          // Progress is member data — main tab bar after login only.
          href: isSignedIn ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="bar-chart-2"
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="store"
        options={{
          title: "Store",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="shopping-bag"
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="packages"
        options={{
          title: "Packages",
          // Members already have a plan — hide the tab for signed-in users
          // (still reachable from the More tab); guests keep it.
          href: isSignedIn ? null : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="package"
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="pt"
        options={{
          title: "PT Dashboard",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="users" size={size} color={color} focused={focused} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            // The tab is a shortcut: open the Personal Trainers screen
            // instead of switching tabs.
            e.preventDefault();
            router.push("/trainers");
          },
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="menu" size={size} color={color} focused={focused} />
          ),
        }}
      />
      {/* Reachable from the More tab, hidden from the tab bar. */}
      <Tabs.Screen name="train" options={{ href: null }} />
      <Tabs.Screen name="classes" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
