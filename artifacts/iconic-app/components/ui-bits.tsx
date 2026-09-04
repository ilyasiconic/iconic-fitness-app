import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { AppText } from "@/components/AppText";
import { useColors } from "@/hooks/useColors";

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <AppText weight="700" size={20} style={{ letterSpacing: -0.5 }}>
        {title}
      </AppText>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <AppText weight="600" size={14} color={colors.primary}>
            {action}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: active ? colors.primary : colors.elevated,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? colors.primary : colors.border,
      }}
    >
      <AppText
        weight="600"
        size={13}
        color={active ? colors.primaryForeground : colors.mutedForeground}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {children}
    </ScrollView>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.segment,
        { backgroundColor: colors.elevated, borderRadius: 999 },
      ]}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.segmentItem,
              {
                backgroundColor: active ? colors.primary : "transparent",
                borderRadius: 999,
              },
            ]}
          >
            <AppText
              weight="600"
              size={13}
              color={active ? colors.primaryForeground : colors.mutedForeground}
            >
              {opt.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  message,
}: {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  message?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <View
        style={[
          styles.emptyIcon,
          { backgroundColor: colors.elevated, borderColor: colors.border },
        ]}
      >
        <Feather name={icon} size={26} color={colors.mutedForeground} />
      </View>
      <AppText weight="700" size={16}>
        {title}
      </AppText>
      {message ? (
        <AppText muted size={13} style={styles.center}>
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

export function LoadingView() {
  const colors = useColors();
  return (
    <View style={styles.fill}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export function ErrorView({ onRetry }: { onRetry?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.fill}>
      <Feather name="wifi-off" size={26} color={colors.mutedForeground} />
      <AppText weight="600" style={{ marginTop: 12 }}>
        Something went wrong
      </AppText>
      {onRetry ? (
        <Pressable onPress={onRetry} style={{ marginTop: 8 }}>
          <AppText weight="600" color={colors.primary}>
            Tap to retry
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 16,
  },
  chipRow: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  segment: { flexDirection: "row", padding: 4, gap: 4 },
  segmentItem: { flex: 1, alignItems: "center", paddingVertical: 10 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 40 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  fill: { paddingVertical: 60, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center", maxWidth: 260 },
});
