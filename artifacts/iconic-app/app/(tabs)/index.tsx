import { useAuth } from "@clerk/expo";
import { useGuest } from "@/hooks/useGuest";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getGetMeQueryKey,
  getGetMyMembershipQueryKey,
  getGetTrackingSummaryQueryKey,
  getListGymsQueryKey,
  getListMembershipsQueryKey,
  getListMyBookingsQueryKey,
  getListMyTrainerBookingsQueryKey,
  getGetPackageBookingQueryKey,
  useAddWater,
  useCreateBooking,
  useCreateMembershipRenewal,
  useGetMe,
  useGetMyMembership,
  useGetPackageBooking,
  useGetTrackingSummary,
  type MyMembership,
  useListClasses,
  useListGyms,
  useListMemberships,
  useListMyBookings,
  useListMyTrainerBookings,
  useGetMyPtProgram,
  getGetMyPtProgramQueryKey,
  useGetMyReferralInfo,
  getGetMyReferralInfoQueryKey,
  useListHomeSlides,
  useListPackageCategories,
  getListPackageCategoriesQueryKey,
  useListStoreCategories,
  useListStoreProducts,
  type ClassSession,
  type Gym,
  type HomeSlide,
  type PackageCategory,
  type StoreCategory,
  type StoreProduct,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";

import { AICoachCard } from "@/components/AICoachCard";
import { EngagementPlanCard } from "@/components/EngagementPlanCard";
import { FitnessJourneyCard } from "@/components/FitnessJourneyCard";
import { WelcomeCelebration } from "@/components/WelcomeCelebration";
import { AppText } from "@/components/AppText";
import { useProfilePhotoUpload } from "@/components/ProfilePhotoPicker";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CoachFab } from "@/components/CoachFab";
import { NotificationBell } from "@/components/NotificationBell";
import { PackageCard } from "@/components/PackageCard";
import { Screen } from "@/components/Screen";
import { YouTubeInline } from "@/components/YouTubeInline";
import {
  CategoryCardSkeleton,
  GymCardSkeleton,
} from "@/components/Skeleton";
import { LoadingView, SectionHeader } from "@/components/ui-bits";
import { useColors } from "@/hooks/useColors";
import { useUserLocation } from "@/hooks/useUserLocation";
import {
  istToday,
  formatClock,
  formatDateLabel,
  istDateStr,
  istDateLabel,
} from "@/lib/dates";
import { resolveImageUrl } from "@/lib/images";
import {
  openExternal,
  websiteUrl,
} from "@/lib/links";

type StoryVideo = {
  name: string;
  role: string;
  quote: string;
  src: string;
  /** Bundled asset so faces always render, even if the website is unreachable. */
  poster: number;
};

const STORY_VIDEOS: StoryVideo[] = [
  {
    name: "Rikitha",
    role: "Fashion Designer · Entrepreneur",
    quote:
      "One pass, every gym near me — I finally stopped making excuses and started showing up.",
    src: `${websiteUrl}/media/testimonial-rikitha.mp4`,
    poster: require("@/assets/images/testimonial-rikitha-poster.jpg"),
  },
  {
    name: "Suraj",
    role: "Product Manager · IT Services",
    quote:
      "The flexibility is unreal. I train wherever my day takes me and never miss a session.",
    src: `${websiteUrl}/media/testimonial-suraj.mp4`,
    poster: require("@/assets/images/testimonial-suraj-poster.jpg"),
  },
  {
    name: "Albha",
    role: "IT Professional",
    quote:
      "Best decision I made this year. The gyms are world-class and the community keeps me going.",
    src: `${websiteUrl}/media/testimonial-albha.mp4`,
    poster: require("@/assets/images/testimonial-albha-poster.jpg"),
  },
];

// Premium floating-card shadow (soft, brand-neutral). Web uses boxShadow to
// avoid the deprecated shadow* warning; native uses shadow*/elevation.
const CARD_SHADOW = Platform.select({
  web: { boxShadow: "0 14px 34px rgba(0,0,0,0.30)" },
  default: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 7,
  },
}) as ViewStyle;

// Number of days before renewal that we start warning the member.
const EXPIRY_SOON_DAYS = 7;

/** Whole IST calendar days from today until `dateIso` (negative = past). */
function daysUntilIst(dateIso: string): number {
  const today = Date.parse(`${istDateStr()}T00:00:00Z`);
  const target = Date.parse(`${istDateStr(new Date(dateIso))}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}

/** Plan card pinned to the top of Home for members with a plan. */
// Fixed premium palette — the card always renders as a dark "black card"
// with lime accents, matching the high-end fitness brand.
/** Premium-style card for signed-in members with no active membership. */
function NoMembershipCard({
  memberName,
  onViewPlans,
}: {
  memberName: string;
  onViewPlans: () => void;
}) {
  const colors = useColors();
  const PREMIUM = getPremiumColors(colors);
  const initials = (memberName || "M")
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={[styles.premiumWrap, CARD_SHADOW, styles.noPlanWrap]}>
      <LinearGradient
        colors={[PREMIUM.bgTop, PREMIUM.bgBottom]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={[styles.premiumCard, styles.noPlanCard, { borderColor: PREMIUM.hairline }]}
      >
        {/* Gold sheen sweeping the top edge */}
        <LinearGradient
          colors={["transparent", PREMIUM.gold + (colors.background === "#000000" || colors.background === "#121212" ? "2E" : "15"), "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.4 }}
          style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
        />
        {/* Soft glow bottom-right */}
        <LinearGradient
          colors={["transparent", PREMIUM.gold + (colors.background === "#000000" || colors.background === "#121212" ? "14" : "0A")]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="award" size={14} color={PREMIUM.gold} />
            <AppText
              size={11}
              weight="700"
              color={PREMIUM.gold}
              style={{ letterSpacing: 1.6 }}
            >
              ICONIC MEMBER
            </AppText>
          </View>
          <View style={styles.noPlanBadge}>
            <AppText size={10} weight="700" color={PREMIUM.faint}>
              INACTIVE
            </AppText>
          </View>
        </View>

        <View style={[styles.noPlanHairline, { backgroundColor: PREMIUM.hairline }]} />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
          }}
        >
          <View style={[styles.noPlanAvatarRing, { borderColor: PREMIUM.gold + "66" }]}>
            <View style={[styles.noPlanAvatar, { borderColor: PREMIUM.hairline, backgroundColor: PREMIUM.hairline }]}>
              <AppText weight="700" size={17} color={PREMIUM.gold}>
                {initials}
              </AppText>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            {memberName ? (
              <AppText weight="700" size={17} color={PREMIUM.text}>
                {memberName}
              </AppText>
            ) : null}
            <AppText size={13} color={PREMIUM.faint} style={{ marginTop: 2 }}>
              No active membership
            </AppText>
            <AppText size={12} color={PREMIUM.faint} style={{ marginTop: 1 }}>
              Unlock all Iconic branches & classes
            </AppText>
          </View>
        </View>

        <Pressable
          onPress={onViewPlans}
          style={({ pressed }) => [
            styles.noPlanCta,
            { backgroundColor: PREMIUM.gold, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Feather name="credit-card" size={15} color={PREMIUM.text} />
          <AppText weight="700" size={14} color={colors.foreground}>
            View membership plans
          </AppText>
          <Feather name="arrow-right" size={15} color={PREMIUM.text} />
        </Pressable>
      </LinearGradient>
    </View>
  );
}

// Fixed highlighted "Join membership" bar pinned above the tab bar for
// signed-in members without an active plan — always visible, never a popup.
function JoinMembershipBar({
  expired,
  onJoin,
}: {
  expired: boolean;
  onJoin: () => void;
}) {
  const colors = useColors();
  const PREMIUM = getPremiumColors(colors);
  return (
    <View style={[styles.joinBarWrap, CARD_SHADOW]}>
      <Pressable
        onPress={onJoin}
        style={({ pressed }) => [
          styles.joinBar,
          { backgroundColor: PREMIUM.gold, opacity: pressed ? 0.88 : 1 },
        ]}
      >
        <View style={[styles.joinBarIcon, { backgroundColor: colors.card }]}>
          <Feather name="zap" size={16} color={PREMIUM.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText weight="700" size={14} color={colors.foreground}>
            {expired ? "Rejoin your membership" : "Join Iconic membership"}
          </AppText>
          <AppText size={11} color={colors.mutedForeground}>
            Choose branch · pick plan · pay online
          </AppText>
        </View>
        <Feather name="arrow-right" size={18} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

function getPremiumColors(colors: any) {
  const isDark = colors.background === "#000000" || colors.background === "#121212";
  return {
    bgTop: isDark ? "#1A1A1C" : colors.card,
    bgBottom: isDark ? "#050505" : colors.secondary,
    gold: colors.primary,
    goldDeep: colors.primaryGradient[1],
    hairline: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    text: colors.foreground,
    faint: colors.mutedForeground,
  };
}

function MembershipStatusCard({
  membership,
  memberName,
  memberPhotoUrl,
  onManage,
  embedded = false,
}: {
  membership: MyMembership;
  memberName: string;
  /** The member's own uploaded profile photo (preferred over the gym record photo). */
  memberPhotoUrl?: string | null;
  onManage: () => void;
  /** Render as a slide inside the top card pager: outer margin handled by the pager. */
  embedded?: boolean;
}) {
  const colors = useColors();
  const PREMIUM = getPremiumColors(colors);
  const queryClient = useQueryClient();
  const router = useRouter();
  // Hide "Book PT Trainer" once the member already has any PT booking or
  // pending session request.
  const ptQuery = useListMyTrainerBookings({
    query: { queryKey: getListMyTrainerBookingsQueryKey() },
  });
  const hasPtBooking = (ptQuery.data ?? []).some(
    (b) => b.status === "paid" || b.status === "pending" || b.status === "enquiry",
  );
  // Once staff assign a trainer, the card swaps "Book PT Trainer" for a
  // "PT Details" entry (trainer + scheduled session timings).
  const ptProgram = useGetMyPtProgram({
    query: { queryKey: getGetMyPtProgramQueryKey() },
  });
  const ptActive = ptProgram.data?.active === true;
  // When the gym system reported no expiry date, renewsOn is a placeholder —
  // never show urgency or a renewal push off the back of it.
  const expiryKnown = membership.expiryKnown !== false;
  const days = daysUntilIst(membership.renewsOn);
  const isExpired =
    membership.status === "expired" || (expiryKnown && days < 0);
  const expiringSoon =
    expiryKnown &&
    !isExpired &&
    membership.status === "active" &&
    days <= EXPIRY_SOON_DAYS;
  const needsRenewal = isExpired || expiringSoon;
  const alertColor = isExpired ? "#FF6B6B" : "#FFB020";
  const expiryLabel = expiryKnown
    ? istDateLabel(istDateStr(new Date(membership.renewsOn)))
    : "—";
  const sinceLabel = membership.startedOn
    ? istDateLabel(membership.startedOn)
    : null;

  // ── One-tap renewal through the YoActiv payment gateway ──────────────────
  const renew = useCreateMembershipRenewal();
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [bookingToken, setBookingToken] = useState<string | null>(null);
  const pollParams = bookingToken ? { token: bookingToken } : undefined;
  const statusQuery = useGetPackageBooking(bookingId ?? 0, pollParams, {
    query: {
      enabled: bookingId !== null,
      queryKey: getGetPackageBookingQueryKey(bookingId ?? 0, pollParams),
      refetchInterval: (q) =>
        q.state.data?.status === "pending" ? 4000 : false,
    },
  });
  const payStatus = bookingId !== null ? statusQuery.data?.status : undefined;

  useEffect(() => {
    if (payStatus === "paid") {
      // Plan changed upstream — refresh membership + payment history.
      queryClient.invalidateQueries({ queryKey: getGetMyMembershipQueryKey() });
    }
  }, [payStatus, queryClient]);

  const startRenewal = useCallback(async () => {
    try {
      const created = await renew.mutateAsync();
      setBookingId(created.id);
      setBookingToken(created.token ?? null);
      await openExternal(created.paymentUrl);
    } catch (err) {
      // Online renewal unavailable (unlinked plan/branch) — offer the website.
      Alert.alert(
        "Online renewal unavailable",
        err instanceof Error && err.message
          ? err.message
          : "Please pick your plan manually instead.",
        [
          { text: "Choose a plan", onPress: onManage },
          { text: "Close", style: "cancel" },
        ],
      );
    }
  }, [renew, onManage]);

  const photo = useProfilePhotoUpload();

  const initials = (memberName || "M")
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const renewLabel =
    payStatus === "pending"
      ? "Waiting for payment…"
      : payStatus === "failed"
        ? "Payment failed — try again"
        : renew.isPending
          ? "Starting payment…"
          : isExpired
            ? "Renew now"
            : "Renew early";

  return (
    <View
      style={[
        styles.premiumWrap,
        CARD_SHADOW,
        embedded ? { marginBottom: 0 } : null,
      ]}
    >
      <LinearGradient
        colors={[PREMIUM.bgTop, PREMIUM.bgBottom]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={[styles.premiumCard, { borderColor: PREMIUM.hairline }]}
      >
        {/* Gold sheen sweeping the top edge */}
        <LinearGradient
          colors={["transparent", PREMIUM.gold + (colors.background === "#000000" || colors.background === "#121212" ? "2E" : "15"), "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.4 }}
          style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="award" size={14} color={PREMIUM.gold} />
          <AppText
            size={11}
            weight="700"
            color={PREMIUM.gold}
            style={{ letterSpacing: 2.4 }}
          >
            PREMIUM MEMBER
          </AppText>
          <View style={{ flex: 1 }} />
          <View
            style={[
              styles.premiumBadge,
              {
                borderColor: needsRenewal ? alertColor : PREMIUM.hairline,
                backgroundColor: needsRenewal
                  ? alertColor + "22"
                  : "rgba(255,255,255,0.06)",
              },
            ]}
          >
            <AppText
              size={11}
              weight="700"
              color={needsRenewal ? alertColor : PREMIUM.gold}
              style={{ textTransform: "capitalize" }}
            >
              {membership.status}
            </AppText>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            marginTop: 16,
          }}
        >
          {/* Tappable avatar: Camera / Gallery chooser to change the photo */}
          <Pressable
            onPress={photo.busy ? undefined : photo.choosePhoto}
            style={[styles.premiumAvatarRing, { borderColor: PREMIUM.gold }]}
            hitSlop={6}
          >
            {photo.localUrl || memberPhotoUrl || membership.photoUrl ? (
              <Image
                source={{
                  uri:
                    photo.localUrl ||
                    memberPhotoUrl ||
                    membership.photoUrl ||
                    undefined,
                }}
                style={styles.premiumAvatar}
              />
            ) : (
              <View
                style={[
                  styles.premiumAvatar,
                  {
                    backgroundColor: PREMIUM.hairline,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                ]}
              >
                <AppText weight="700" size={20} color={PREMIUM.gold}>
                  {initials}
                </AppText>
              </View>
            )}
            {photo.busy ? (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    borderRadius: 27,
                    backgroundColor: "rgba(0,0,0,0.45)",
                    alignItems: "center",
                    justifyContent: "center",
                  },
                ]}
              >
                <ActivityIndicator color="#fff" size="small" />
              </View>
            ) : (
              <View style={[styles.premiumAvatarCamBadge, { backgroundColor: PREMIUM.gold }]}>
                <Feather name="camera" size={10} color="#0B0B0F" />
              </View>
            )}
          </Pressable>
          <View style={{ flex: 1 }}>
            <AppText weight="700" size={18} color={PREMIUM.text}>
              {memberName || "Iconic Member"}
            </AppText>
            <AppText size={13} color={PREMIUM.faint} style={{ marginTop: 2 }}>
              {membership.planName}
            </AppText>
            {membership.branchName ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  marginTop: 3,
                }}
              >
                <Feather name="map-pin" size={11} color={PREMIUM.faint} />
                <AppText size={12} color={PREMIUM.faint}>
                  {membership.branchName}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.premiumDivider, { backgroundColor: PREMIUM.hairline }]} />

        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1 }}>
            <AppText size={11} color={PREMIUM.faint} style={{ letterSpacing: 1 }}>
              VALID FROM
            </AppText>
            <AppText
              weight="700"
              size={15}
              color={PREMIUM.text}
              style={{ marginTop: 3 }}
            >
              {sinceLabel ?? "—"}
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText size={11} color={PREMIUM.faint} style={{ letterSpacing: 1 }}>
              {isExpired ? "EXPIRED ON" : "VALID TILL"}
            </AppText>
            <AppText
              weight="700"
              size={15}
              color={needsRenewal ? alertColor : PREMIUM.text}
              style={{ marginTop: 3 }}
            >
              {expiryLabel}
            </AppText>
          </View>
          {!isExpired && expiryKnown ? (
            <View style={{ alignItems: "flex-end" }}>
              <AppText size={11} color={PREMIUM.faint} style={{ letterSpacing: 1 }}>
                DAYS LEFT
              </AppText>
              <AppText
                weight="700"
                size={15}
                color={expiringSoon ? alertColor : PREMIUM.gold}
                style={{ marginTop: 3 }}
              >
                {Math.max(days, 0)}
              </AppText>
            </View>
          ) : null}
        </View>

        {payStatus === "paid" ? (
          <View
            style={[
              styles.premiumRenewStrip,
              { borderColor: "#3DDC84", backgroundColor: "#3DDC8422" },
            ]}
          >
            <Feather name="check-circle" size={16} color="#3DDC84" />
            <AppText size={13} weight="700" color="#3DDC84" style={{ flex: 1 }}>
              Payment received — your plan is being renewed
            </AppText>
          </View>
        ) : needsRenewal ? (
          <>
            <View
              style={[
                styles.premiumRenewStrip,
                { borderColor: alertColor, backgroundColor: alertColor + "1C" },
              ]}
            >
              <Feather name="alert-triangle" size={16} color={alertColor} />
              <AppText size={13} weight="700" color={alertColor} style={{ flex: 1 }}>
                {isExpired
                  ? `Expired on ${expiryLabel} — renew to keep access`
                  : days <= 0
                    ? `Expires today — renew to stay active`
                    : `Expiring in ${days} day${days === 1 ? "" : "s"}`}
              </AppText>
            </View>
            <Pressable
              onPress={startRenewal}
              disabled={renew.isPending || payStatus === "pending"}
            >
              {({ pressed }) => (
                <LinearGradient
                  colors={[PREMIUM.gold, PREMIUM.goldDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.premiumRenewBtn,
                    {
                      opacity:
                        pressed || renew.isPending || payStatus === "pending"
                          ? 0.75
                          : 1,
                    },
                  ]}
                >
                  <Feather name="credit-card" size={16} color="#100E07" />
                  <AppText weight="700" size={15} color="#100E07">
                    {renewLabel}
                  </AppText>
                </LinearGradient>
              )}
            </Pressable>
            <AppText
              size={11}
              color={PREMIUM.faint}
              style={{ textAlign: "center", marginTop: 8 }}
            >
              Secure payment via our gym payment gateway
            </AppText>
          </>
        ) : (
          /* All extra CTAs (PT Details, Book Classes, Book PT Trainer) are
             hidden from the Home card per user request — PT booking lives on
             the Personal Trainers screen. */
          null
        )}
      </LinearGradient>
    </View>
  );
}

/**
 * Swipeable pager merging the AI coach card and the premium member card into
 * one top-of-Home row. The slide order flips so a plan needing renewal is the
 * first thing a member sees.
 */
function TopCardPager({
  aiCard,
  memberCard,
  membershipFirst,
}: {
  aiCard: React.ReactNode;
  memberCard: React.ReactNode;
  membershipFirst: boolean;
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  // Screen applies 20px horizontal padding, so the pager (and each slide)
  // spans width - 40.
  const SLIDE_W = width - 40;
  const scrollRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Keep the pager aligned when the slide width changes (rotation, resize):
  // re-snap the current page to the new pixel offset.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      x: activeRef.current * SLIDE_W,
      animated: false,
    });
  }, [SLIDE_W]);

  // If renewal priority flips at runtime, reset to the first slide so the
  // leading card matches the new priority (and dots stay in sync).
  useEffect(() => {
    setActive(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [membershipFirst]);

  const slides = membershipFirst
    ? [
        { key: "member", node: memberCard },
        { key: "ai", node: aiCard },
      ]
    : [
        { key: "ai", node: aiCard },
        { key: "member", node: memberCard },
      ];

  return (
    <View style={styles.topPagerWrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) =>
          setActive(
            Math.max(
              0,
              Math.min(
                slides.length - 1,
                Math.round(e.nativeEvent.contentOffset.x / SLIDE_W),
              ),
            ),
          )
        }
      >
        {slides.map((s) => (
          <View
            key={s.key}
            style={{ width: SLIDE_W, justifyContent: "center" }}
          >
            {s.node}
          </View>
        ))}
      </ScrollView>
      <View style={styles.topPagerDots}>
        {slides.map((s, i) => (
          <View
            key={s.key}
            style={[
              styles.topPagerDot,
              {
                backgroundColor:
                  i === active ? colors.primary : colors.elevated,
                width: i === active ? 18 : 7,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const SOFT_SHADOW = Platform.select({
  web: { boxShadow: "0 8px 22px rgba(0,0,0,0.20)" },
  default: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
}) as ViewStyle;

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isSignedIn: clerkSignedIn } = useAuth();
  const { isGuest } = useGuest();
  // "Continue without login" must behave like a real guest even when a
  // previous login session is still remembered on the device — otherwise the
  // guest home shows the member's personal card. Guest mode wins.
  const isSignedIn = !!clerkSignedIn && !isGuest;
  const queryClient = useQueryClient();

  // Public, no-auth content — works for guests and members alike.
  const gymsQuery = useListGyms({ sort: "rating" });
  const classesQuery = useListClasses({});
  const membershipsQuery = useListMemberships({
    query: { queryKey: getListMembershipsQueryKey() },
  });

  // Personal content — only fetched when signed in (guests get 401 otherwise).
  const summaryQuery = useGetTrackingSummary(
    { date: istToday() },
    {
      query: {
        enabled: !!isSignedIn,
        queryKey: getGetTrackingSummaryQueryKey({ date: istToday() }),
      },
    },
  );
  const meQuery = useGetMe({
    query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() },
  });
  const myMembershipQuery = useGetMyMembership({
    query: { enabled: !!isSignedIn, queryKey: getGetMyMembershipQueryKey() },
  });
  // Banner slide targeting: "Members" = anyone logged in to the app,
  // "Customers" = guests browsing without an account. Auth state is known
  // synchronously, so targeting is always settled.
  const membershipSettled = true;
  const isMember = !!isSignedIn;
  const membership = myMembershipQuery.data ?? null;

  // ── Fixed join bar ────────────────────────────────────────────────────────
  // Signed-in members without an active plan (none at all, or expired) get a
  // permanent highlighted bar pinned above the tab bar that leads straight
  // into branch selection → plan → online payment.
  const membershipInactive =
    !!isSignedIn &&
    myMembershipQuery.isSuccess &&
    (!membership || membership.status === "expired");

  // ── One-time "Diwali crackers" welcome for new members ───────────────────
  // First time we see an active plan on this device, celebrate with a
  // fireworks overlay; an AsyncStorage flag (keyed by plan start so a renewal
  // to a fresh plan celebrates again) makes sure it only ever plays once.
  const [showWelcome, setShowWelcome] = useState(false);
  const welcomeKey =
    membership && membership.status === "active"
      ? `welcomeCelebrated:v1:${membership.startedOn ?? membership.planName}`
      : null;
  useEffect(() => {
    if (!welcomeKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const seen = await AsyncStorage.getItem(welcomeKey);
        if (!seen && !cancelled) setShowWelcome(true);
      } catch {
        // Storage unavailable — skip the celebration rather than loop it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [welcomeKey]);
  const dismissWelcome = useCallback(() => {
    setShowWelcome(false);
    if (welcomeKey) void AsyncStorage.setItem(welcomeKey, "1").catch(() => {});
  }, [welcomeKey]);
  // Signed-in users get a tracking-focused Home: the discovery sections
  // (Explore packages / Gyms near me / Top rated gyms) are guest-only.
  const showDiscovery = !isSignedIn;
  const bookingsQuery = useListMyBookings(
    { status: "upcoming" },
    {
      query: {
        enabled: !!isSignedIn,
        queryKey: getListMyBookingsQueryKey({ status: "upcoming" }),
      },
    },
  );

  const addWater = useAddWater();
  const createBooking = useCreateBooking();
  const [quickLogging, setQuickLogging] = useState(false);
  // Collapsible "Your progress today" block — arrow toggles it open/closed.
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [bookingId, setBookingId] = useState<number | null>(null);

  const bookedClassIds = useMemo(
    () => new Set((bookingsQuery.data ?? []).map((b) => b.classId)),
    [bookingsQuery.data],
  );

  const gyms = useMemo(() => gymsQuery.data ?? [], [gymsQuery.data]);
  const heroGyms = useMemo(() => gyms.slice(0, 5), [gyms]);
  const featured = useMemo(
    () => (classesQuery.data ?? []).slice(0, 6),
    [classesQuery.data],
  );
  const annualAll = useMemo(
    () =>
      (membershipsQuery.data ?? [])
        .filter((p) => p.billingPeriod === "annual")
        .sort((a, b) => {
          if (a.popular && !b.popular) return -1;
          if (!a.popular && b.popular) return 1;
          return a.priceInr - b.priceInr;
        }),
    [membershipsQuery.data],
  );
  const packages = useMemo(() => annualAll.slice(0, 4), [annualAll]);

  // Package categories — shown as a compact 3D tile row on Home.
  const packageCategoriesQuery = useListPackageCategories({
    query: { queryKey: getListPackageCategoriesQueryKey() },
  });
  const packageCategories = packageCategoriesQuery.data ?? [];
  // Wait for the categories query to settle before choosing tiles vs the
  // plan-card fallback, so the section doesn't flash cards then swap to tiles.
  const packageCategoriesSettled =
    packageCategoriesQuery.isSuccess || packageCategoriesQuery.isError;
  // One category card fills the visible width (screen minus the 20px screen
  // padding on each side); the rest peek in via horizontal swipe.
  const { width: screenW } = useWindowDimensions();
  const catCardW = screenW - 40;

  const refetchAll = useCallback(() => {
    void gymsQuery.refetch();
    void classesQuery.refetch();
    void membershipsQuery.refetch();
    if (isSignedIn) {
      void summaryQuery.refetch();
      void meQuery.refetch();
      void myMembershipQuery.refetch();
      void bookingsQuery.refetch();
    }
  }, [
    gymsQuery,
    classesQuery,
    membershipsQuery,
    isSignedIn,
    summaryQuery,
    meQuery,
    myMembershipQuery,
    bookingsQuery,
  ]);

  const onQuickWater = useCallback(async () => {
    if (quickLogging) return;
    setQuickLogging(true);
    try {
      await addWater.mutateAsync({ data: { amountMl: 250 } });
      await queryClient.invalidateQueries({
        queryKey: getGetTrackingSummaryQueryKey(),
      });
    } catch {
      // Guests (and any unauthenticated state) can't log data — fail quietly.
    } finally {
      setQuickLogging(false);
    }
  }, [quickLogging, addWater, queryClient]);

  const onBook = useCallback(
    async (session: ClassSession) => {
      if (!isSignedIn) {
        router.push("/(auth)/sign-in");
        return;
      }
      setBookingId(session.id);
      try {
        await createBooking.mutateAsync({ data: { classId: session.id } });
        await queryClient.invalidateQueries({
          queryKey: getListMyBookingsQueryKey(),
        });
        Alert.alert("Booked!", `You're in for ${session.title}.`);
      } catch {
        Alert.alert("Could not book", "This class may be full. Try another.");
      } finally {
        setBookingId(null);
      }
    },
    [isSignedIn, router, createBooking, queryClient],
  );

  const summary = summaryQuery.data;

  const calRatio = summary ? summary.caloriesIn / (summary.calorieGoal || 1) : 0;
  const waterRatio = summary ? summary.waterMl / (summary.waterGoalMl || 1) : 0;
  const stepRatio = summary ? summary.steps / (summary.stepGoal || 1) : 0;

  // Overall standing = average of the three goal completions (each capped at
  // 100% so one over-achieved goal can't hide a neglected one).
  const overallPct = Math.round(
    ((Math.min(calRatio, 1) + Math.min(waterRatio, 1) + Math.min(stepRatio, 1)) /
      3) *
      100,
  );
  const standingMessage =
    overallPct >= 100
      ? "All goals hit — outstanding!"
      : overallPct >= 75
        ? "Almost there — strong day!"
        : overallPct >= 40
          ? "Good pace, keep pushing"
          : overallPct > 0
            ? "Time to get moving"
            : "Log your first activity";

  return (
    <View style={{ flex: 1 }}>
    <Screen
      refreshing={summaryQuery.isRefetching || gymsQuery.isRefetching}
      onRefresh={refetchAll}
      contentContainerStyle={{ paddingTop: 8 }}
    >
      {/* Top card — signed-in members with a plan see only the membership card
          (the AI coach lives on the floating chat button); everyone else gets
          the AI coach card. */}
      {membership ? (
        <MembershipStatusCard
          membership={membership}
          memberName={meQuery.data?.name ?? ""}
          memberPhotoUrl={resolveImageUrl(meQuery.data?.avatarUrl)}
          onManage={() => router.push("/book-package")}
        />
      ) : isSignedIn && myMembershipQuery.isFetched ? (
        <NoMembershipCard
          memberName={meQuery.data?.name ?? ""}
          onViewPlans={() => router.push("/book-package")}
        />
      ) : isSignedIn ? null : (
        <AICoachCard
          needsAssessment={false}
          onPress={() => router.push("/coach")}
        />
      )}

      {/* Kick-starter PT trial journey — only for ACTIVE members (waits for
          the membership check to settle so it never flashes for others); the
          card hides itself once every step (both trials + feedbacks) is done. */}
      {isSignedIn &&
      myMembershipQuery.isSuccess &&
      membership?.status === "active" ? (
        <FitnessJourneyCard />
      ) : null}

      {/* Engagement 45-day plan */}
      {isSignedIn ? <EngagementPlanCard /> : null}

      {/* Redeem prizes wallet — points spendable on store, packages & PT */}
      {isSignedIn ? <WalletRewardsCard /> : null}

      {/* Personal tracking — pinned to the top for signed-in members.
          One arrow collapses/expands the whole block (progress + quick log + today). */}
      {isSignedIn ? (
        <>
          <Pressable
            onPress={() => setTrackingOpen((v) => !v)}
            style={styles.sectionToggleRow}
            hitSlop={8}
          >
            <AppText weight="700" size={18} style={{ flex: 1 }}>
              Your progress today
            </AppText>
            <View
              style={[
                styles.sectionToggleBtn,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <Feather
                name={trackingOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.primary}
              />
            </View>
          </Pressable>
          {trackingOpen ? (
          <>
          <View style={styles.heroWrap}>
            <LinearGradient
              colors={[colors.primary + "26", "transparent"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[styles.heroGlow, { pointerEvents: "none" }]}
            />
            <Card style={styles.hero} tone="elevated">
              <View style={styles.standingHeader}>
                <View style={{ flex: 1 }}>
                  <AppText weight="700" size={16}>
                    Today's standing
                  </AppText>
                  <AppText muted size={12}>
                    {standingMessage}
                  </AppText>
                </View>
                <View
                  style={[
                    styles.standingBadge,
                    { borderColor: colors.primary + "55" },
                  ]}
                >
                  <AppText weight="700" size={18} color={colors.primary}>
                    {overallPct}%
                  </AppText>
                  <AppText size={10} muted style={{ letterSpacing: 0.5 }}>
                    OVERALL
                  </AppText>
                </View>
              </View>

              <GoalBar
                icon="zap"
                color={colors.calorie}
                label="Calories"
                ratio={calRatio}
                value={`${summary?.caloriesIn ?? 0}`}
                goal={`${summary?.calorieGoal ?? 0} kcal`}
              />
              <GoalBar
                icon="droplet"
                color={colors.water}
                label="Water"
                ratio={waterRatio}
                value={`${((summary?.waterMl ?? 0) / 1000).toFixed(1)}L`}
                goal={`${((summary?.waterGoalMl ?? 0) / 1000).toFixed(1)}L`}
              />
              <GoalBar
                icon="trending-up"
                color={colors.steps}
                label="Steps"
                ratio={stepRatio}
                value={`${summary?.steps ?? 0}`}
                goal={`${summary?.stepGoal ?? 0}`}
              />
            </Card>
          </View>

          <SectionHeader title="Quick log" />
          <View style={styles.quickRow}>
            <QuickTile
              icon="droplet"
              label="+250ml"
              sub="Water"
              color={colors.water}
              onPress={onQuickWater}
              loading={quickLogging}
            />
            <QuickTile
              icon="coffee"
              label="Log meal"
              sub="Diet"
              color={colors.calorie}
              onPress={() => router.push("/diet")}
            />
            <QuickTile
              icon="activity"
              label="Workout"
              sub="Move"
              color={colors.primary}
              onPress={() => router.push("/workouts")}
            />
          </View>

          <SectionHeader title="Today" />
          <View style={styles.statGrid}>
            <StatCard
              icon="zap"
              tint={colors.primary}
              value={`${summary?.caloriesOut ?? 0}`}
              label="kcal burned"
            />
            <StatCard
              icon="award"
              tint={colors.protein}
              value={`${summary?.proteinG ?? 0}g`}
              label={`of ${summary?.proteinGoalG ?? 0}g protein`}
            />
            <StatCard
              icon="repeat"
              tint={colors.water}
              value={`${summary?.workouts ?? 0}`}
              label="workouts today"
            />
            <StatCard
              icon="target"
              tint={colors.calorie}
              value={`${summary?.weeklyWorkouts ?? 0}/${summary?.weeklyGoal ?? 0}`}
              label="weekly goal"
            />
          </View>

          <Pressable onPress={() => router.push("/water")}>
            <Card style={styles.waterCta}>
              <View style={{ flex: 1 }}>
                <AppText weight="700" size={16}>
                  Hydration log
                </AppText>
                <AppText muted size={13}>
                  Track every glass, hit your daily target.
                </AppText>
              </View>
              <Feather
                name="chevron-right"
                size={22}
                color={colors.mutedForeground}
              />
            </Card>
          </Pressable>
          </>
          ) : null}
        </>
      ) : null}

      {/* Explore packages — swipeable category cards (falls back to plan
          cards when no categories are configured). Guests only. */}
      {showDiscovery &&
      packageCategoriesSettled &&
      (packageCategories.length > 0 || packages.length > 0) ? (
        <>
          <SectionHeader
            title="Explore packages"
            action="View all"
            onAction={() => router.push("/packages")}
          />
          {packageCategories.length > 0 ? (
            // Single column: one card visible at a time; swipe sideways to
            // move between categories (snap paging).
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={catCardW + 12}
              decelerationRate="fast"
              contentContainerStyle={styles.catTileList}
              style={{ marginBottom: 20 }}
            >
              {packageCategories.map((c) => {
                const count = annualAll.filter(
                  (p) => (p.categoryId ?? 0) === c.id,
                ).length;
                return (
                  <PackageCategoryTile
                    key={c.id}
                    category={c}
                    count={count}
                    width={catCardW}
                    onPress={() =>
                      count === 0
                        ? router.push("/book-package")
                        : router.push({
                            pathname: "/(tabs)/packages",
                            params: { categoryId: String(c.id) },
                          })
                    }
                  />
                );
              })}
            </ScrollView>
          ) : (
            <View style={{ gap: 12, marginBottom: 8 }}>
              {packages.map((plan) => (
                <PackageCard
                  key={plan.id}
                  plan={plan}
                  onPress={() => router.push(`/package/${plan.id}`)}
                />
              ))}
            </View>
          )}
        </>
      ) : null}

      {/* Shop by category — hidden for active members (waits for the
          membership check to settle so it never flashes in for members) */}
      {membershipSettled && !isMember ? <ShopByCategory /> : null}

      {/* Home banner slider (admin-managed) */}
      <HeroSlider
        gyms={heroGyms}
        isMember={isMember}
        membershipSettled={membershipSettled}
        onExplore={() => router.push("/gyms")}
        onOpenUrl={(url, title) => {
          // Keep the viewer inside the app: internal paths navigate directly,
          // external links open in the in-app browser screen.
          if (url.startsWith("/")) {
            router.push(url as never);
            return;
          }
          router.push({
            pathname: "/web",
            params: { url, title: title ?? "Iconic Fitness" },
          });
        }}
        nearSlide={
          isSignedIn ? undefined : { onOpenGym: () => router.push("/gyms") }
        }
      />

      {/* Watch our story (member testimonials) */}
      <StorySection />

      {/* Top rated gyms — hidden for active members (waits for the
          membership check to settle so it never flashes in for members) */}
      {membershipSettled && !isMember ? (
        <>
          <SectionHeader
            title="Top rated gyms"
            action="View all"
            onAction={() => router.push("/gyms")}
          />
          {gymsQuery.isLoading ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.gymRow}
              style={{ marginBottom: 28 }}
            >
              {[0, 1, 2].map((k) => (
                <GymCardSkeleton key={k} />
              ))}
            </ScrollView>
          ) : gyms.length === 0 ? (
            <Card style={{ marginBottom: 28 }}>
              <AppText weight="700" size={15}>
                No gyms to show yet
              </AppText>
              <AppText muted size={13} style={{ marginTop: 4 }}>
                Pull to refresh or explore on our website.
              </AppText>
            </Card>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.gymRow}
              style={{ marginBottom: 28 }}
            >
              {gyms.slice(0, 8).map((g, i) => (
                <GymCard
                  key={g.id}
                  gym={g}
                  index={i}
                  onPress={() => router.push("/gyms")}
                />
              ))}
            </ScrollView>
          )}
        </>
      ) : null}

      {/* Book a class — members only: book upcoming classes and track them here */}
      {membershipSettled && isMember ? (
        <>
      <SectionHeader
        title="Book your next session"
        action="See all"
        onAction={() => router.push("/classes")}
      />
      {classesQuery.isLoading ? (
        <View style={{ height: 150, justifyContent: "center" }}>
          <LoadingView />
        </View>
      ) : featured.length === 0 ? (
        <Card style={{ marginBottom: 28 }}>
          <AppText weight="700" size={15}>
            No classes scheduled
          </AppText>
          <AppText muted size={13} style={{ marginTop: 4 }}>
            New sessions drop soon — pull to refresh.
          </AppText>
        </Card>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.classRow}
          style={{ marginBottom: 28 }}
        >
          {featured.map((s) => (
            <ClassCard
              key={s.id}
              session={s}
              booked={bookedClassIds.has(s.id)}
              loading={bookingId === s.id}
              onBook={() => onBook(s)}
              onOpen={() => router.push("/classes")}
            />
          ))}
        </ScrollView>
      )}
        </>
      ) : null}

      {/* Guest sign-in nudge */}
      {!isSignedIn ? (
        <Pressable onPress={() => router.push("/(auth)/sign-in")}>
          <Card style={[styles.joinCta, SOFT_SHADOW]} tone="elevated">
            <View style={[styles.joinIcon, { backgroundColor: colors.primary }]}>
              <Feather name="user-plus" size={22} color={colors.primaryForeground} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText weight="700" size={16}>
                Track your fitness
              </AppText>
              <AppText muted size={13} style={{ marginTop: 2 }}>
                Log in to book classes and track workouts, water & meals.
              </AppText>
            </View>
            <Feather name="chevron-right" size={22} color={colors.mutedForeground} />
          </Card>
        </Pressable>
      ) : null}
    </Screen>
      <NotificationBell />
      {isSignedIn ? <CoachFab /> : null}
      {membershipInactive ? (
        <JoinMembershipBar
          expired={membership?.status === "expired"}
          onJoin={() => router.push("/book-package")}
        />
      ) : null}
      {showWelcome ? (
        <WelcomeCelebration
          memberName={meQuery.data?.name ?? ""}
          onDone={dismissWelcome}
        />
      ) : null}
    </View>
  );
}

type RenderSlide =
  | { key: string; type: "brand" }
  | { key: string; type: "gym"; gym: Gym }
  | { key: string; type: "admin"; slide: HomeSlide }
  | { key: string; type: "near" }
  | { key: string; type: "ai" };

function youtubeId(url: string): string | undefined {
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/,
  );
  const id = m ? m[1] : /^[\w-]{11}$/.test(url.trim()) ? url.trim() : null;
  return id ?? undefined;
}

function youtubeThumb(url: string): string | undefined {
  const id = youtubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined;
}

function isVideoSlide(item: RenderSlide): boolean {
  return (
    item.type === "admin" &&
    item.slide.kind === "youtube" &&
    !!youtubeId(item.slide.mediaUrl)
  );
}

function HeroSlider({
  gyms,
  isMember,
  membershipSettled,
  onExplore,
  onOpenUrl,
  aiSlide,
  nearSlide,
}: {
  gyms: Gym[];
  isMember: boolean;
  membershipSettled: boolean;
  onExplore: () => void;
  onOpenUrl: (url: string, title?: string) => void;
  /** When set, an AI coach slide is appended to the carousel (signed-in users). */
  aiSlide?: { needsAssessment: boolean; onPress: () => void };
  /** When set, a "Gyms near me" slide is appended to the carousel. */
  nearSlide?: { onOpenGym: () => void };
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  // Card-style slider sized like the AI Coach card: inset within the
  // Screen's 20px horizontal padding instead of full-bleed.
  const SLIDE_W = width - 40;
  const scrollRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);

  const slidesQuery = useListHomeSlides();
  const adminSlides = slidesQuery.data ?? [];

  // Show only slides targeted at this viewer: "all" for everyone, "members"
  // for viewers with an active plan, "customers" for viewers without one.
  // Until membership status is settled we show only "all" slides so a member
  // is never briefly shown customer-only content (and vice versa).
  const visibleAdminSlides = useMemo(
    () =>
      adminSlides.filter((s) => {
        if (s.audience === "all") return true;
        if (!membershipSettled) return false;
        if (s.audience === "members") return isMember;
        return !isMember; // "customers"
      }),
    [adminSlides, isMember, membershipSettled],
  );

  // Admin-managed slides take over the banner entirely. When none are visible
  // to this viewer (fresh install / prod before setup, or every slide is
  // targeted at the other audience) we fall back to a code default so the
  // banner is never empty: a brand intro followed by the top gyms.
  const slides: RenderSlide[] = useMemo(() => {
    const base: RenderSlide[] =
      visibleAdminSlides.length > 0
        ? visibleAdminSlides.map((s) => ({
            key: `a${s.id}`,
            type: "admin" as const,
            slide: s,
          }))
        : [
            { key: "brand", type: "brand" as const },
            ...gyms.map((g) => ({
              key: `g${g.id}`,
              type: "gym" as const,
              gym: g,
            })),
          ];
    // "Gyms near me" rides in the same carousel — swipe to find the closest
    // branches (or enable location if it's off).
    if (nearSlide) base.push({ key: "near", type: "near" as const });
    // Signed-in users get the AI coach as the last slide of the same carousel
    // so the banner and AI share one row — swipe to reach the coach.
    if (aiSlide) base.push({ key: "ai", type: "ai" as const });
    return base;
  }, [visibleAdminSlides, gyms, aiSlide, nearSlide]);

  const total = slides.length;

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Keep the active index valid if the slide count shrinks.
  useEffect(() => {
    if (active > total - 1) {
      setActive(0);
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [total, active]);

  const goToNext = useCallback(() => {
    if (total <= 1) return;
    const next = (activeRef.current + 1) % total;
    scrollRef.current?.scrollTo({ x: next * SLIDE_W, animated: true });
    setActive(next);
  }, [total, SLIDE_W]);

  // Auto-advance: image/gif/gym/brand slides advance on a timer. Video slides
  // do NOT — they advance via `onEnded` once the video finishes playing.
  useEffect(() => {
    if (total <= 1) return;
    const current = slides[active];
    if (current && isVideoSlide(current)) return;
    const t = setTimeout(goToNext, 4500);
    return () => clearTimeout(t);
  }, [active, total, slides, goToNext]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SLIDE_W);
    setActive(idx);
  };

  const onAdminPress = (s: HomeSlide) => {
    if (s.kind === "youtube") {
      onOpenUrl(s.mediaUrl, s.title || "Video");
      return;
    }
    if (s.ctaUrl) {
      onOpenUrl(s.ctaUrl, s.title || undefined);
      return;
    }
    onExplore();
  };

  if (total === 0) return null;

  return (
    <View style={styles.sliderWrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
      >
        {slides.map((item, index) => {
          if (item.type === "near") {
            return (
              <View key={item.key} style={{ width: SLIDE_W }}>
                <NearbyGymsSlide onOpenGym={() => nearSlide?.onOpenGym()} />
              </View>
            );
          }

          if (item.type === "ai") {
            return (
              <View key={item.key} style={{ width: SLIDE_W }}>
                <AICoachCard
                  embedded
                  needsAssessment={aiSlide?.needsAssessment ?? false}
                  onPress={() => aiSlide?.onPress()}
                />
              </View>
            );
          }

          if (item.type === "brand") {
            return (
              <Pressable
                key={item.key}
                onPress={onExplore}
                style={{ width: SLIDE_W }}
              >
                <View style={[styles.slide, { backgroundColor: colors.card }]}>
                  <LinearGradient
                    colors={colors.primaryGradient as [string, string]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.slideContent}>
                    <AppText
                      weight="700"
                      size={12}
                      color={colors.primaryForeground}
                    >
                      ICONIC FITNESS
                    </AppText>
                    <AppText
                      weight="700"
                      size={26}
                      color={colors.primaryForeground}
                      style={{ marginTop: 6 }}
                    >
                      Train like you mean it.
                    </AppText>
                    <View style={styles.sliderCtaPill}>
                      <AppText weight="700" size={13} color={colors.primary}>
                        Explore gyms
                      </AppText>
                      <Feather
                        name="arrow-right"
                        size={14}
                        color={colors.primary}
                      />
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }

          if (item.type === "gym") {
            const g = item.gym;
            const img = resolveImageUrl(g.heroImage);
            return (
              <Pressable
                key={item.key}
                onPress={onExplore}
                style={{ width: SLIDE_W }}
              >
                <View style={[styles.slide, { backgroundColor: colors.card }]}>
                  {img ? (
                    <Image
                      source={{ uri: img }}
                      style={StyleSheet.absoluteFill}
                    />
                  ) : null}
                  <LinearGradient
                    colors={["transparent", "rgba(10,12,8,0.92)"]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.slideTopRow}>
                    {g.isPremium ? (
                      <View
                        style={[styles.badge, { backgroundColor: colors.primary }]}
                      >
                        <AppText
                          weight="700"
                          size={10}
                          color={colors.primaryForeground}
                        >
                          PREMIUM
                        </AppText>
                      </View>
                    ) : (
                      <View />
                    )}
                    <View style={styles.ratingPill}>
                      <Feather name="star" size={11} color={colors.primary} />
                      <AppText weight="700" size={11} color={colors.foreground}>
                        {g.rating.toFixed(1)}
                      </AppText>
                    </View>
                  </View>
                  <View style={styles.slideContent}>
                    <AppText weight="700" size={22} color={colors.foreground}>
                      {g.name}
                    </AppText>
                    <View style={styles.slideMetaRow}>
                      <Feather
                        name="map-pin"
                        size={13}
                        color={colors.mutedForeground}
                      />
                      <AppText size={13} color={colors.mutedForeground}>
                        {g.area || g.city}
                      </AppText>
                      <AppText size={13} color={colors.primary} weight="700">
                        {"  ₹"}
                        {g.priceFrom}/mo
                      </AppText>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }

          // Admin-managed slide (image / gif / youtube)
          const s = item.slide;
          const isYt = s.kind === "youtube";
          const ytId = isYt ? youtubeId(s.mediaUrl) : undefined;
          const mediaUri = isYt
            ? youtubeThumb(s.mediaUrl)
            : resolveImageUrl(s.mediaUrl);
          const hasText = !!(s.title || s.subtitle || s.ctaLabel);
          return (
            <Pressable
              key={item.key}
              onPress={() => onAdminPress(s)}
              style={{ width: SLIDE_W }}
            >
              <View style={[styles.slide, { backgroundColor: colors.card }]}>
                {isYt && ytId ? (
                  // Auto-playing muted inline video. Plays only while this slide
                  // is active; when it ends the carousel advances (onEnded). A
                  // lone video loops. Non-interactive so taps open the full video
                  // and swipes still page the slider.
                  <YouTubeInline
                    videoId={ytId}
                    active={active === index}
                    loop={total <= 1}
                    onEnded={goToNext}
                    style={StyleSheet.absoluteFill}
                  />
                ) : mediaUri ? (
                  // expo-image: stock RN <Image> can't play GIF/animated-WebP
                  // on Android APKs (shows a frozen first frame).
                  <ExpoImage
                    source={{ uri: mediaUri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                  />
                ) : null}
                <LinearGradient
                  colors={[
                    "rgba(10,12,8,0.10)",
                    "rgba(10,12,8,0.45)",
                    "rgba(10,12,8,0.92)",
                  ]}
                  locations={[0, 0.55, 1]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                {isYt ? (
                  <View style={styles.slideBadge} pointerEvents="none">
                    <Feather
                      name="maximize-2"
                      size={13}
                      color={colors.primaryForeground}
                    />
                  </View>
                ) : null}
                {hasText ? (
                  <View style={styles.slideContent}>
                    {s.title ? (
                      <AppText weight="700" size={24} color={colors.foreground}>
                        {s.title}
                      </AppText>
                    ) : null}
                    {s.subtitle ? (
                      <AppText
                        size={14}
                        color={colors.mutedForeground}
                        style={{ marginTop: 4 }}
                      >
                        {s.subtitle}
                      </AppText>
                    ) : null}
                    {s.ctaLabel ? (
                      <View
                        style={[
                          styles.sliderCtaPill,
                          { backgroundColor: colors.primary },
                        ]}
                      >
                        <AppText
                          weight="700"
                          size={13}
                          color={colors.primaryForeground}
                        >
                          {s.ctaLabel}
                        </AppText>
                        <Feather
                          name="arrow-right"
                          size={14}
                          color={colors.primaryForeground}
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Dots */}
      {total > 1 ? (
        <View style={styles.dots}>
          {slides.map((item, i) => (
            <View
              key={item.key}
              style={[
                styles.dot,
                {
                  backgroundColor: i === active ? colors.primary : colors.border,
                  width: i === active ? 22 : 7,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function StorySection() {
  const colors = useColors();
  const [active, setActive] = useState<StoryVideo | null>(null);

  return (
    <>
      <SectionHeader title="Watch our story" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.gymRow}
        style={{ marginBottom: 28 }}
      >
        {STORY_VIDEOS.map((s) => (
          <Pressable
            key={s.name}
            onPress={() => setActive(s)}
            style={({ pressed }) => [
              styles.storyCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: pressed ? 0.92 : 1,
              },
            ]}
          >
            <View style={styles.storyPosterWrap}>
              <Image source={s.poster} style={styles.storyPoster} />
              <LinearGradient
                colors={["transparent", "rgba(10,12,8,0.85)"]}
                style={StyleSheet.absoluteFill}
              />
              <View
                style={[styles.storyPlayBtn, { backgroundColor: colors.primary }]}
              >
                <Feather name="play" size={24} color={colors.primaryForeground} />
              </View>
            </View>
            <View style={styles.storyBody}>
              <AppText weight="700" size={16}>
                {s.name}
              </AppText>
              <AppText size={12} color={colors.primary} style={{ marginTop: 2 }}>
                {s.role}
              </AppText>
              <AppText muted size={13} style={{ marginTop: 8 }} numberOfLines={3}>
                “{s.quote}”
              </AppText>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {active ? (
        <StoryVideoModal story={active} onClose={() => setActive(null)} />
      ) : null}
    </>
  );
}

function StoryVideoModal({
  story,
  onClose,
}: {
  story: StoryVideo;
  onClose: () => void;
}) {
  const player = useVideoPlayer(story.src, (p) => {
    p.play();
  });

  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={["portrait", "landscape"]}
    >
      <View style={styles.storyModalRoot}>
        <VideoView
          player={player}
          style={styles.storyModalVideo}
          contentFit="contain"
          allowsFullscreen
          nativeControls
        />
        <View style={styles.storyModalCaption} pointerEvents="none">
          <AppText weight="700" size={18} color="#FFFFFF">
            {story.name}
          </AppText>
          <AppText size={13} color="rgba(255,255,255,0.7)" style={{ marginTop: 2 }}>
            {story.role}
          </AppText>
        </View>
        <Pressable
          onPress={onClose}
          style={styles.storyModalClose}
          hitSlop={10}
        >
          <Feather name="x" size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
  );
}

function GymCard({
  gym,
  onPress,
  showDistance,
  index = 0,
}: {
  gym: Gym;
  onPress: () => void;
  showDistance?: boolean;
  index?: number;
}) {
  const colors = useColors();
  const img = resolveImageUrl(gym.heroImage);
  return (
    <View
      style={[CARD_SHADOW, { borderRadius: 26, backgroundColor: colors.card }]}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.gymCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          },
        ]}
      >
        <View style={styles.gymImgWrap}>
          {img ? (
            <Image source={{ uri: img }} style={styles.gymImg} resizeMode="cover" />
          ) : (
            <View style={[styles.gymImg, { backgroundColor: colors.elevated }]} />
          )}
          {/* Bottom scrim so the floating badges always read cleanly. */}
          <LinearGradient
            colors={["transparent", "rgba(10,12,8,0.55)"]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {showDistance ? (
            <View style={[styles.distancePill, { backgroundColor: colors.primary }]}>
              <Feather name="navigation" size={10} color={colors.primaryForeground} />
              <AppText weight="700" size={11} color={colors.primaryForeground}>
                {Number.isFinite(gym.distanceKm) ? gym.distanceKm.toFixed(1) : "–"} km
              </AppText>
            </View>
          ) : null}
        </View>
        {/* Branch cards stay simple by owner request: photo + name only. */}
        <View style={styles.gymBody}>
          <AppText weight="700" size={16} numberOfLines={1}>
            {gym.name}
          </AppText>
        </View>
      </Pressable>
    </View>
  );
}

// Fallback gradient palettes + icons keyed by category slug so a category with
// no product imagery still renders a rich, on-brand tile.
const CATEGORY_META: Record<
  string,
  { icon: keyof typeof Feather.glyphMap; colors: [string, string] }
> = {
  apparel: { icon: "shopping-bag", colors: ["#1E3A2F", "#0A0C08"] },
  equipment: { icon: "activity", colors: ["#2A2352", "#0A0C08"] },
  supplements: { icon: "droplet", colors: ["#123A44", "#0A0C08"] },
  accessories: { icon: "watch", colors: ["#402438", "#0A0C08"] },
  wellness: { icon: "heart", colors: ["#3A2A12", "#0A0C08"] },
};
const CATEGORY_FALLBACK_GRADIENTS: [string, string][] = [
  ["#1E3A2F", "#0A0C08"],
  ["#2A2352", "#0A0C08"],
  ["#123A44", "#0A0C08"],
  ["#402438", "#0A0C08"],
];

function ShopByCategory() {
  const router = useRouter();
  const catsQuery = useListStoreCategories();
  const productsQuery = useListStoreProducts();

  const cats = catsQuery.data ?? [];
  const products = useMemo(
    () => productsQuery.data ?? [],
    [productsQuery.data],
  );

  // First active product image + item count per category slug.
  const byCategory = useMemo(() => {
    const map = new Map<string, { image?: string; count: number }>();
    for (const p of products) {
      const entry = map.get(p.category) ?? { image: undefined, count: 0 };
      entry.count += 1;
      if (!entry.image && p.imageUrl) entry.image = p.imageUrl;
      map.set(p.category, entry);
    }
    return map;
  }, [products]);

  if (catsQuery.isLoading) {
    return (
      <>
        <SectionHeader title="Shop by category" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catRow}
          style={{ marginBottom: 28 }}
        >
          {[0, 1, 2, 3].map((k) => (
            <CategoryCardSkeleton key={k} />
          ))}
        </ScrollView>
      </>
    );
  }
  if (cats.length === 0) return null;

  return (
    <>
      <SectionHeader
        title="Shop by category"
        action="Shop all"
        onAction={() => router.push("/store")}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catRow}
        style={{ marginBottom: 28 }}
      >
        {cats.map((c, i) => (
          <CategoryCard
            key={c.slug}
            category={c}
            index={i}
            image={byCategory.get(c.slug)?.image}
            count={byCategory.get(c.slug)?.count ?? 0}
          />
        ))}
      </ScrollView>
    </>
  );
}

function CategoryCard({
  category,
  index,
  image,
  count,
}: {
  category: StoreCategory;
  index: number;
  image?: string;
  count: number;
}) {
  const router = useRouter();
  const colors = useColors();
  const meta = CATEGORY_META[category.slug];
  const gradient =
    meta?.colors ??
    CATEGORY_FALLBACK_GRADIENTS[index % CATEGORY_FALLBACK_GRADIENTS.length];
  const icon = meta?.icon ?? "tag";
  const uri = resolveImageUrl(image);

  return (
    <View
      style={[CARD_SHADOW, { borderRadius: 22, backgroundColor: colors.card }]}
    >
      <Pressable
        onPress={() =>
          router.push(`/store?category=${encodeURIComponent(category.slug)}`)
        }
        style={({ pressed }) => [
          styles.catCard,
          { transform: [{ scale: pressed ? 0.96 : 1 }] },
        ]}
      >
        {/* Base gradient — always present (also the fallback when no image). */}
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {uri ? (
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.catIconWrap}>
            <Feather name={icon} size={30} color={colors.primary} />
          </View>
        )}
        {/* Bottom scrim so the label always reads. */}
        <LinearGradient
          colors={["transparent", "rgba(10,12,8,0.15)", "rgba(10,12,8,0.92)"]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        {/* Lime arrow badge. */}
        <View style={[styles.catArrow, { backgroundColor: colors.primary }]}>
          <Feather name="arrow-up-right" size={16} color={colors.primaryForeground} />
        </View>
        <View style={styles.catLabel}>
          <AppText weight="700" size={16} color={colors.cardForeground}>
            {category.name}
          </AppText>
          {count > 0 ? (
            <AppText size={12} color={colors.mutedForeground} style={{ marginTop: 2 }}>
              {count} {count === 1 ? "item" : "items"}
            </AppText>
          ) : (
            <AppText size={12} color={colors.mutedForeground} style={{ marginTop: 2 }}>
              Shop now
            </AppText>
          )}
        </View>
      </Pressable>
    </View>
  );
}

/**
 * Package-category card: image on the left, content (name, package count,
 * "View packages" link) on the right. Shadow lives on the Pressable wrapper;
 * only the media block clips (iOS drops a view's own shadow under
 * overflow:hidden).
 */
function PackageCategoryTile({
  category,
  count,
  width,
  onPress,
}: {
  category: PackageCategory;
  count: number;
  width: number;
  onPress: () => void;
}) {
  const colors = useColors();
  const uri = resolveImageUrl(category.imageUrl ?? "");

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pkgCatCard,
        {
          width,
          backgroundColor: colors.card,
          borderColor: colors.border,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={styles.pkgCatMedia}>
        {uri ? (
          <ExpoImage
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <LinearGradient
            colors={colors.primaryGradient as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              StyleSheet.absoluteFill,
              { alignItems: "center", justifyContent: "center" },
            ]}
          >
            <Feather name="grid" size={24} color={colors.cardForeground} />
          </LinearGradient>
        )}
      </View>

      <View style={styles.pkgCatBody}>
        <AppText weight="700" size={16} numberOfLines={1}>
          {category.name}
        </AppText>
        <AppText muted size={12} numberOfLines={1} style={{ marginTop: 2 }}>
          {count > 0
            ? `${count} package${count === 1 ? "" : "s"}`
            : "Live plans at your branch"}
        </AppText>
        <View style={styles.pkgCatFoot}>
          <AppText weight="600" size={13} color={colors.primary}>
            View packages
          </AppText>
          <Feather name="chevron-right" size={16} color={colors.primary} />
        </View>
      </View>
    </Pressable>
  );
}

/**
 * "Gyms near me" as a carousel slide. Before location is granted it's a
 * gradient call-to-action (tap → request permission); once granted it shows
 * the closest branch with its photo and distance (tap → explore gyms).
 */
function NearbyGymsSlide({ onOpenGym }: { onOpenGym: () => void }) {
  const colors = useColors();
  const { coords, status, request } = useUserLocation();

  const nearbyQuery = useListGyms(
    { lat: coords?.lat, lng: coords?.lng, sort: "distance" },
    {
      query: {
        enabled: !!coords,
        queryKey: getListGymsQueryKey({
          lat: coords?.lat,
          lng: coords?.lng,
          sort: "distance",
        }),
      },
    },
  );
  const nearby = nearbyQuery.data ?? [];
  const nearest = nearby[0];
  const moreCount = Math.max(0, nearby.length - 1);

  const needsLocation =
    status === "idle" || status === "denied" || status === "error";
  const denied = status === "denied" || status === "error";
  const loading =
    !needsLocation && (status === "loading" || nearbyQuery.isLoading);
  const img = nearest ? resolveImageUrl(nearest.heroImage) : undefined;

  const title = needsLocation
    ? denied
      ? "Turn on location"
      : "Find gyms near you"
    : loading
      ? "Finding gyms near you…"
      : nearbyQuery.isError
        ? "Couldn’t load nearby gyms"
        : nearest
          ? nearest.name
          : "No branches nearby yet";
  const subtitle = needsLocation
    ? denied
      ? "Allow location access to see the closest branches."
      : "See the closest Iconic branches around you."
    : loading
      ? "Hang tight — locating the closest branches."
      : nearbyQuery.isError
        ? "Something went wrong — explore all gyms instead."
        : nearest
          ? [
            Number.isFinite(nearest.distanceKm)
              ? `${nearest.distanceKm.toFixed(1)} km away`
              : null,
            moreCount > 0 ? `+${moreCount} more nearby` : null,
          ]
            .filter(Boolean)
            .join(" · ") ||
          nearest.area ||
          nearest.city
        : "Explore all gyms instead.";
  const pill = needsLocation
    ? denied
      ? "Retry"
      : "Enable location"
    : "Explore gyms";

  return (
    <Pressable onPress={needsLocation ? request : onOpenGym}>
      <View style={[styles.slide, { backgroundColor: colors.card }]}>
        {img ? (
          <>
            <Image source={{ uri: img }} style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={["transparent", "rgba(10,12,8,0.92)"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : (
          <LinearGradient
            colors={colors.primaryGradient as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={styles.slideContent}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather
              name="navigation"
              size={12}
              color={colors.primaryForeground}
            />
            <AppText weight="700" size={12} color={colors.primaryForeground}>
              GYMS NEAR ME
            </AppText>
          </View>
          <AppText
            weight="700"
            size={24}
            color={colors.primaryForeground}
            style={{ marginTop: 6 }}
            numberOfLines={1}
          >
            {title}
          </AppText>
          <AppText
            size={13}
            color={colors.primaryForeground}
            style={{ marginTop: 4, opacity: 0.9 }}
            numberOfLines={2}
          >
            {subtitle}
          </AppText>
          {!loading ? (
            <View style={styles.sliderCtaPill}>
              <AppText weight="700" size={13} color={colors.primary}>
                {pill}
              </AppText>
              <Feather name="arrow-right" size={14} color={colors.primary} />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function ClassCard({
  session,
  booked,
  loading,
  onBook,
  onOpen,
}: {
  session: ClassSession;
  booked: boolean;
  loading: boolean;
  onBook: () => void;
  onOpen: () => void;
}) {
  const colors = useColors();
  const full = session.booked >= session.capacity;
  const tint = intensityColor(session.intensity, colors);

  return (
    <View
      style={[
        styles.classCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      {/* Tapping the card body opens the full Classes screen. The Book button
          below is a sibling (not nested) so its press can't double-fire. */}
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
      >
        <LinearGradient
          colors={[tint + "33", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.classBanner}
        >
          <View style={[styles.intensity, { backgroundColor: tint + "33" }]}>
            <AppText weight="700" size={10} color={tint}>
              {session.intensity.toUpperCase()}
            </AppText>
          </View>
          <Feather name="activity" size={20} color={tint} />
        </LinearGradient>

        <View style={styles.classBody}>
          <AppText weight="700" size={16} numberOfLines={1}>
            {session.title}
          </AppText>
          <AppText muted size={12} numberOfLines={1} style={{ marginTop: 2 }}>
            {session.gymName}
          </AppText>

          <View style={styles.classMetaRow}>
            <Feather name="clock" size={12} color={colors.mutedForeground} />
            <AppText muted size={12}>
              {formatClock(session.startsAt)}
            </AppText>
            <AppText muted size={12}>
              ·
            </AppText>
            <AppText muted size={12}>
              {formatDateLabel(session.startsAt)}
            </AppText>
          </View>
        </View>
      </Pressable>

      <View style={styles.bookWrap}>
        <Pressable
          onPress={onBook}
          disabled={booked || full || loading}
          style={({ pressed }) => [
            styles.bookBtn,
            {
              backgroundColor: booked || full ? colors.elevated : "transparent",
              borderRadius: colors.radius - 6,
              opacity: pressed ? 0.85 : 1,
              overflow: "hidden",
            },
          ]}
        >
          {!booked && !full ? (
            <LinearGradient
              colors={colors.primaryGradient as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <AppText
            weight="700"
            size={13}
            color={booked || full ? colors.mutedForeground : colors.primaryForeground}
          >
            {loading ? "Booking…" : booked ? "Booked ✓" : full ? "Full" : "Book now"}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function intensityColor(
  intensity: string,
  colors: ReturnType<typeof useColors>,
): string {
  if (intensity === "high") return colors.destructive;
  if (intensity === "medium") return colors.calorie;
  return colors.success;
}

function GoalBar({
  icon,
  color,
  label,
  ratio,
  value,
  goal,
}: {
  icon: keyof typeof Feather.glyphMap;
  color: string;
  label: string;
  ratio: number;
  value: string;
  goal: string;
}) {
  const colors = useColors();
  const pct = Math.round(Math.min(Math.max(ratio, 0), 1) * 100);
  return (
    <View style={styles.goalBar}>
      <View style={styles.goalBarTop}>
        <View style={[styles.goalBarIcon, { backgroundColor: color + "22" }]}>
          <Feather name={icon} size={13} color={color} />
        </View>
        <AppText size={13} muted style={{ flex: 1 }}>
          {label}
        </AppText>
        <AppText weight="700" size={13}>
          {value}
        </AppText>
        <AppText size={12} muted>
          {" "}
          / {goal}
        </AppText>
        <AppText
          weight="700"
          size={12}
          color={pct >= 100 ? color : colors.mutedForeground}
          style={styles.goalBarPct}
        >
          {pct}%
        </AppText>
      </View>
      <View style={[styles.goalBarTrack, { backgroundColor: colors.elevated }]}>
        <View
          style={{
            width: `${Math.max(pct, 2)}%`,
            height: "100%",
            borderRadius: 6,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

function QuickTile({
  icon,
  label,
  sub,
  color,
  onPress,
  loading,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  sub: string;
  color: string;
  onPress: () => void;
  loading?: boolean;
}) {
  const colors = useColors();
  const shake = useSharedValue(0);

  useEffect(() => {
    // Attention nudge: rest ~3.5s, then a quick wiggle, forever.
    shake.value = withRepeat(
      withDelay(
        3500,
        withSequence(
          withTiming(-1, { duration: 70 }),
          withTiming(1, { duration: 120 }),
          withTiming(-1, { duration: 120 }),
          withTiming(1, { duration: 120 }),
          withTiming(0, { duration: 90 }),
        ),
      ),
      -1,
      false,
    );
  }, [shake]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${shake.value * 10}deg` },
      { scale: 1 + Math.abs(shake.value) * 0.12 },
    ],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.quickTile,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
          opacity: pressed || loading ? 0.7 : 1,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.quickIcon3d,
          { shadowColor: color, borderColor: color + "55" },
          shakeStyle,
        ]}
      >
        <LinearGradient
          colors={[color + "55", color + "14"]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.quickIconFill}
        >
          <Feather name={icon} size={20} color={color} />
        </LinearGradient>
      </Animated.View>
      <AppText weight="700" size={14}>
        {label}
      </AppText>
      <AppText muted size={11}>
        {sub}
      </AppText>
    </Pressable>
  );
}

function StatCard({
  icon,
  tint,
  value,
  label,
}: {
  icon: keyof typeof Feather.glyphMap;
  tint: string;
  value: string;
  label: string;
}) {
  const colors = useColors();
  return (
    <Card style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: tint + "22" }]}>
        <Feather name={icon} size={18} color={tint} />
      </View>
      <AppText weight="700" size={22}>
        {value}
      </AppText>
      <AppText muted size={12}>
        {label}
      </AppText>
    </Card>
  );
}

/** Redeem prizes wallet — shows the member's points balance and where to
 *  spend it (store, membership packages, PT plans). Hidden while loading and
 *  when the wallet is empty, so the home feed stays clean. */
function WalletRewardsCard() {
  const colors = useColors();
  const router = useRouter();
  const referralQuery = useGetMyReferralInfo({
    query: { queryKey: getGetMyReferralInfoQueryKey() },
  });
  const balance = referralQuery.data?.balanceInr ?? 0;
  if (!referralQuery.isSuccess) return null;
  return (
    <Pressable onPress={() => router.push("/(tabs)/store")}>
      <Card
        style={{
          marginBottom: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${colors.primary}22`,
          }}
        >
          <Feather name="gift" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText weight="700" size={15}>
            Redeem prizes wallet
          </AppText>
          <AppText size={12} color={colors.mutedForeground} style={{ marginTop: 2 }}>
            {balance > 0
              ? "Use your points on store orders, memberships & PT plans (₹1 each)"
              : "Earn points by referring friends — spend them on store, memberships & PT"}
          </AppText>
        </View>
        <AppText weight="700" size={18} color={colors.primary}>
          {balance.toLocaleString("en-IN")} pts
        </AppText>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  brandRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  brandLogo: {
    width: 40,
    height: 40,
  },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },

  // Slider — rounded card matching the AI Coach card's footprint (inset
  // within the Screen's horizontal padding, ~226 tall, 30px corners).
  // ── Premium member card ────────────────────────────────────────────────
  // Shadow on the wrapper, clipping on the gradient (iOS clips a view's own
  // shadow when it also has overflow:hidden).
  noPlanWrap: {
    marginTop: 18,
  },
  noPlanCard: {
    borderWidth: 1,
    paddingVertical: 20,
  },
  noPlanBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  noPlanHairline: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 14,
  },
  noPlanAvatarRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  noPlanAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  noPlanCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  premiumWrap: {
    marginBottom: 16,
    borderRadius: 24,
  },
  joinBarWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 14,
    borderRadius: 16,
  },
  joinBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
  },
  joinBarIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  topPagerWrap: { marginTop: 20, marginBottom: 4 },
  topPagerDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  topPagerDot: { height: 7, borderRadius: 4 },
  premiumCard: {
    borderRadius: 24,
    overflow: "hidden",
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  premiumBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  premiumAvatarCamBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  premiumAvatarRing: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  premiumAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  premiumDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 16,
  },
  premiumRenewStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 16,
    marginBottom: 12,
  },
  premiumRenewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    paddingVertical: 14,
  },
  premiumManageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  // Shadow lives on the wrapper, clipping on the inner slide (iOS clips a
  // view's own shadow when it also has overflow:hidden).
  sliderWrap: {
    marginTop: 8,
    marginBottom: 24,
    borderRadius: 30,
    ...SOFT_SHADOW,
  },
  catTileList: {
    gap: 12,
    paddingRight: 20,
    paddingVertical: 4,
  },
  pkgCatCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 12,
    ...CARD_SHADOW,
  },
  pkgCatMedia: {
    width: 118,
    height: 108,
    borderRadius: 14,
    overflow: "hidden",
  },
  pkgCatBody: {
    flex: 1,
    paddingRight: 4,
    justifyContent: "center",
  },
  pkgCatFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 8,
  },
  slide: {
    height: 226,
    overflow: "hidden",
    justifyContent: "flex-end",
    borderRadius: 30,
  },
  slideBadge: {
    position: "absolute",
    top: 14,
    right: 16,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,12,8,0.55)",
  },
  slideTopRow: {
    position: "absolute",
    top: 14,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  slideContent: { padding: 18 },
  slideMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
  },
  sliderCtaPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    marginTop: 16,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(10,12,8,0.7)",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  dot: { height: 7, borderRadius: 4 },

  // Shop by category
  catRow: { gap: 14, paddingRight: 8, paddingVertical: 2 },
  catCard: {
    width: 150,
    height: 190,
    borderRadius: 22,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  catIconWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  catArrow: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  catLabel: { padding: 14 },

  // Gym cards
  gymRow: { gap: 14, paddingRight: 8, paddingVertical: 2 },
  gymCard: {
    width: 250,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  gymImgWrap: { height: 172 },
  gymImg: { width: "100%", height: "100%" },
  gymRating: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(10,12,8,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  gymBody: { padding: 16 },
  gymMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  gymPremium: {
    position: "absolute",
    top: 10,
    left: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  gymFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  openBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  distancePill: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  openDot: { width: 8, height: 8, borderRadius: 4 },

  // Near-me CTA
  nearCta: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    padding: 22,
    borderRadius: 26,
    overflow: "hidden",
  },
  nearGlow: {
    position: "absolute",
    top: -46,
    right: -34,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  nearCtaIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  nearCtaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    marginTop: 16,
  },

  // Story testimonial cards
  storyCard: {
    width: 230,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  storyPosterWrap: { height: 300, width: "100%" },
  storyPoster: { width: "100%", height: "100%" },
  storyPlayBtn: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -27,
    marginLeft: -27,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  storyBody: { padding: 14 },
  // Story video player modal
  storyModalRoot: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  storyModalVideo: { width: "100%", height: "78%" },
  storyModalClose: {
    position: "absolute",
    top: 54,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  storyModalCaption: { position: "absolute", bottom: 64, left: 24, right: 24 },

  // Join CTA (guests)
  joinCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  joinIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  // Personal tracking
  heroWrap: { marginBottom: 28 },
  sectionToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  sectionToggleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  heroGlow: {
    position: "absolute",
    top: -10,
    left: 20,
    right: 20,
    height: 120,
    borderRadius: 80,
  },
  hero: { gap: 16, paddingVertical: 20 },
  standingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 2,
  },
  standingBadge: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  goalBar: { gap: 7 },
  goalBarTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  goalBarIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  goalBarPct: { marginLeft: 6, minWidth: 38, textAlign: "right" },
  goalBarTrack: {
    height: 10,
    borderRadius: 6,
    overflow: "hidden",
  },

  classRow: { gap: 14, paddingRight: 8, paddingVertical: 2 },
  classCard: {
    width: 200,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  classBanner: {
    height: 70,
    paddingHorizontal: 14,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  intensity: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  classBody: { paddingHorizontal: 14, paddingTop: 12 },
  classMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  bookWrap: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14 },
  bookBtn: {
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  quickRow: { flexDirection: "row", gap: 12, marginBottom: 28 },
  quickTile: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  quickIcon3d: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    marginBottom: 6,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 8,
  },
  quickIconFill: {
    flex: 1,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  statCard: { width: "47.5%", gap: 8 },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  waterCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
