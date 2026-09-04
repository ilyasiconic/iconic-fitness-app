import { forwardRef, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import {
  SafeAreaView,
  type Edge,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

// Top padding used on web when there is no real safe-area inset, sized to
// clear the simulated notch drawn by the canvas phone frame.
export const WEB_NOTCH_TOP = 52;

type Props = {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: readonly Edge[];
  contentContainerStyle?: StyleProp<ViewStyle>;
  padded?: boolean;
};

export const Screen = forwardRef<ScrollView, Props>(function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  edges = ["top"],
  contentContainerStyle,
  padded = true,
}, ref) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const padStyle = padded ? styles.padded : undefined;
  // On web/canvas previews there are no safe-area insets, so SafeAreaView adds
  // no top padding and content hugs (and gets clipped by) the simulated
  // notch/dynamic island of the phone frame — use a generous fallback there.
  // On native an inset of 0 usually means an iOS sheet modal that already
  // clears the notch, so only a small breathing-room pad is needed.
  // The fallback must survive per-screen `contentContainerStyle.paddingTop`
  // overrides, so it is applied LAST using the larger of the two values.
  const fallbackTop =
    edges.includes("top") && insets.top === 0
      ? Platform.OS === "web"
        ? WEB_NOTCH_TOP
        : 16
      : 0;
  const requestedTop = StyleSheet.flatten(contentContainerStyle)?.paddingTop;
  const topFallback =
    fallbackTop > 0
      ? {
          paddingTop: Math.max(
            fallbackTop,
            typeof requestedTop === "number" ? requestedTop : 0,
          ),
        }
      : undefined;

  const body = scroll ? (
        <ScrollView
          ref={ref}
          style={styles.flex}
          contentContainerStyle={[padStyle, contentContainerStyle, topFallback]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={!!refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, padStyle, contentContainerStyle, topFallback]}>
          {children}
        </View>
      );

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.flex, { backgroundColor: colors.background }]}
    >
      {Platform.OS === "web" ? (
        body
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          {body}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { paddingHorizontal: 20, paddingBottom: 120 },
});

