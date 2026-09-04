import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/components/AppText";
import { useColors } from "@/hooks/useColors";

const COACH_IMG = require("../assets/images/ai-coach-robot.webp");

/** Soft outer float/depth shadow (web boxShadow / native shadow*). */
const CARD_SHADOW: ViewStyle = Platform.select({
  web: { boxShadow: "0 24px 60px -20px rgba(0,0,0,0.65)" } as unknown as ViewStyle,
  default: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 14,
  },
});

type FloatIconProps = {
  name: React.ComponentProps<typeof Feather>["name"];
  style: ViewStyle;
  delay: number;
  tint: string;
  border: string;
};

/** A small frosted "holographic" fitness icon that gently floats. */
function FloatIcon({ name, style, delay, tint, border }: FloatIconProps) {
  const colors = useColors();
  const isDarkBg = colors.background === "#000000" || colors.background === "#121212";
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
  }, [delay, t]);
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(t.value, [0, 1], [-4, 4]) }],
    opacity: interpolate(t.value, [0, 1], [0.75, 1]),
  }));
  return (
    <Animated.View
      style={[
        styles.holo,
        { borderColor: border, backgroundColor: isDarkBg ? "rgba(10,12,8,0.4)" : "rgba(255,255,255,0.4)" },
        style,
        anim,
      ]}
      pointerEvents="none"
    >
      <BlurView intensity={24} tint={isDarkBg ? "dark" : "light"} style={StyleSheet.absoluteFill} />
      <Feather name={name} size={15} color={tint} />
    </Animated.View>
  );
}

export function AICoachCard({
  needsAssessment,
  onPress,
  embedded = false,
}: {
  needsAssessment: boolean;
  onPress: () => void;
  /** Render as a slide inside the hero slider: no outer margins/shadow, fixed slide height. */
  embedded?: boolean;
}) {
  const colors = useColors();

  const breathe = useSharedValue(0);
  const glow = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    breathe.value = withRepeat(
      withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    glow.value = withRepeat(
      withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    ring.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [breathe, glow, ring]);

  const breatheStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(breathe.value, [0, 1], [0, -7]) }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.55, 0.95]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.92, 1.08]) }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 1], [0.5, 0]),
    transform: [{ scale: interpolate(ring.value, [0, 1], [1, 2.4]) }],
  }));

  const title = needsAssessment ? "Meet your AI Coach" : "Talk to your AI Coach";
  const subtitle = needsAssessment
    ? "A few quick questions and I'll craft your personal plan."
    : "Live guidance from your workouts, meals & goals.";

  return (
    <Animated.View
      style={[
        embedded ? null : CARD_SHADOW,
        embedded
            ? { borderRadius: 30, backgroundColor: colors.card }
            : { marginTop: 20, marginBottom: 4, borderRadius: 30, backgroundColor: colors.card },
      ]}
    >
      <Pressable onPress={onPress}>
        {({ pressed }) => (
          <View
            style={[
              styles.card,
              embedded ? { height: 226 } : null,
              {
                borderColor: "rgba(127,194,64,0.22)",
                transform: [{ scale: pressed ? 0.985 : 1 }],
              },
            ]}
          >
            {/* Frosted glass base */}
            <BlurView intensity={30} tint={colors.background === "#000000" || colors.background === "#121212" ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            <View style={styles.glassTint} />

            {/* Emerald radial glow behind the coach (stacked soft discs) */}
            <Animated.View style={[styles.glowWrap, glowStyle]} pointerEvents="none">
              <View
                style={[
                  styles.glowDisc,
                  { width: 300, height: 300, borderRadius: 150, backgroundColor: colors.primary, opacity: 0.1 },
                ]}
              />
              <View
                style={[
                  styles.glowDisc,
                  { width: 210, height: 210, borderRadius: 105, backgroundColor: colors.primary, opacity: 0.14 },
                ]}
              />
              <View
                style={[
                  styles.glowDisc,
                  { width: 130, height: 130, borderRadius: 65, backgroundColor: colors.primary, opacity: 0.2 },
                ]}
              />
            </Animated.View>

            {/* Subtle particles */}
            <View pointerEvents="none" style={[styles.particle, { top: 26, left: 150, backgroundColor: colors.primary }]} />
            <View pointerEvents="none" style={[styles.particle, { top: 92, left: 190, backgroundColor: colors.primary, opacity: 0.5 }]} />
            <View pointerEvents="none" style={[styles.particle, { top: 150, right: 150, backgroundColor: colors.primary, opacity: 0.4 }]} />
            <View pointerEvents="none" style={[styles.particle, { top: 60, right: 118, backgroundColor: colors.foreground, opacity: 0.35 }]} />

            {/* Floating holographic fitness icons */}
            <FloatIcon name="activity" delay={0} tint={colors.primary} border="rgba(127,194,64,0.35)" style={{ top: 18, right: 132 }} />
            <FloatIcon name="heart" delay={500} tint="#FF6B6B" border="rgba(255,107,107,0.35)" style={{ top: 118, right: 150 }} />
            <FloatIcon name="zap" delay={1000} tint={colors.primary} border="rgba(127,194,64,0.35)" style={{ bottom: 20, right: 128 }} />

            {/* The living coach */}
            <Animated.View style={[styles.coachWrap, breatheStyle]} pointerEvents="none">
              <Image source={COACH_IMG} style={styles.coach} contentFit="contain" />
            </Animated.View>

            {/* Top sheen for glass depth */}
            <LinearGradient
              colors={[colors.background === "#000000" || colors.background === "#121212" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.sheen}
              pointerEvents="none"
            />

            {/* Content */}
            <View style={styles.content}>
              <View style={styles.eyebrowRow}>
                <View style={[styles.liveDot, { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }]} />
                <AppText size={11} weight="700" style={{ letterSpacing: 2, color: colors.primary }}>
                  AI FITNESS AGENT
                </AppText>
              </View>

              <AppText weight="700" size={24} style={{ marginTop: 10, color: colors.foreground }}>
                {title}
              </AppText>
              <AppText size={14} style={{ marginTop: 6, maxWidth: 210, color: colors.mutedForeground, lineHeight: 20 }}>
                {subtitle}
              </AppText>

              <View style={styles.ctaRow}>
                <LinearGradient
                  colors={colors.primaryGradient as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.ctaPill}
                >
                  <Feather name="message-circle" size={15} color={colors.primaryForeground} />
                  <AppText weight="700" size={13.5} style={{ color: colors.primaryForeground }}>
                    {needsAssessment ? "Start assessment" : "Talk to AI Coach"}
                  </AppText>
                </LinearGradient>

                {/* Circular mic with soft pulse */}
                <View style={styles.micWrap}>
                  <Animated.View
                    style={[styles.micRing, { borderColor: colors.primary }, ringStyle]}
                    pointerEvents="none"
                  />
                  <View style={[styles.micBtn, { backgroundColor: colors.primary }]}>
                    <Feather name="mic" size={18} color={colors.primaryForeground} />
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 226,
    borderRadius: 30,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "rgba(20,24,15,0.72)",
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
  },
  glowWrap: {
    position: "absolute",
    right: -20,
    top: -30,
    width: 300,
    height: 300,
    alignItems: "center",
    justifyContent: "center",
  },
  glowDisc: { position: "absolute" },
  particle: { position: "absolute", width: 4, height: 4, borderRadius: 2, opacity: 0.7 },
  holo: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coachWrap: {
    position: "absolute",
    right: -14,
    bottom: 0,
    width: 218,
    height: 228,
  },
  coach: { width: "100%", height: "100%" },
  sheen: { position: "absolute", top: 0, left: 0, right: 0, height: 80 },
  content: { padding: 20, paddingRight: 165 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  ctaRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 18 },
  ctaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 22,
  },
  micWrap: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  micRing: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
