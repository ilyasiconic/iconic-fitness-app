import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import {
  getGetMeQueryKey,
  getGetMyPtProgramQueryKey,
  getGetMyReferralInfoQueryKey,
  useGetMyReferralInfo,
  getGetTrainerBookingQueryKey,
  getListTrainerPackagesQueryKey,
  useCreateTrainerBooking,
  useGetMe,
  useGetTrainerBooking,
  useListTrainerPackages,
  type TrainerPackage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ModalHeader } from "@/components/ModalHeader";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorView, LoadingView } from "@/components/ui-bits";
import { useColors } from "@/hooks/useColors";
import { istDateInNDays, istToday } from "@/lib/dates";
import { openExternal } from "@/lib/links";

function notify(title: string, message: string) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    window.alert(`${title}\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

/**
 * Paid PT plan checkout — shown after the free Kick Start (2 trial sessions)
 * is completed. Pays via the gym's hosted Razorpay page; once payment lands,
 * the trainer's PT dashboard starts the monthly sessions automatically.
 */
export default function BookPtPlanScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();
  const params = useLocalSearchParams<{ gymId?: string }>();
  const gymId = Number(params.gymId);
  const validGym = Number.isInteger(gymId) && gymId > 0;

  const meQuery = useGetMe({
    query: { enabled: isLoaded && !!isSignedIn, queryKey: getGetMeQueryKey() },
  });

  const pkgParams = { gymId: validGym ? gymId : 0 };
  const packagesQuery = useListTrainerPackages(pkgParams, {
    query: {
      enabled: validGym,
      queryKey: getListTrainerPackagesQueryKey(pkgParams),
    },
  });
  // The PT-sales branch may not flag every plan as PT — prefer flagged ones,
  // otherwise show everything the branch offers online.
  const packages = useMemo(() => {
    const all = packagesQuery.data ?? [];
    const flagged = all.filter((p) => p.pt);
    return flagged.length > 0 ? flagged : all;
  }, [packagesQuery.data]);

  const referralQuery = useGetMyReferralInfo({
    query: {
      enabled: isLoaded && !!isSignedIn,
      queryKey: getGetMyReferralInfoQueryKey(),
    },
  });

  const [pkgId, setPkgId] = useState<number | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bookingId, setBookingId] = useState<number | null>(null);
  const createBooking = useCreateTrainerBooking();

  const statusQuery = useGetTrainerBooking(bookingId ?? 0, {
    query: {
      enabled: bookingId !== null,
      queryKey: getGetTrainerBookingQueryKey(bookingId ?? 0),
      refetchInterval: (q) =>
        q.state.data?.status === "pending" ? 4000 : false,
    },
  });
  const status = bookingId !== null ? statusQuery.data?.status : undefined;

  const selected = packages.find((p) => p.id === pkgId) ?? null;

  // Wallet points redemption (1 point = ₹1); keep at least ₹1 payable.
  const pointsAvailable = referralQuery.data?.balanceInr ?? 0;
  const listPrice = selected?.amountInr ?? 0;
  const pointsDiscount = Math.min(pointsAvailable, Math.max(listPrice - 1, 0));
  const payable = usePoints ? listPrice - pointsDiscount : listPrice;

  // Once the payment lands, refresh the PT program so PT Details shows the
  // new plan (fires once on the pending → paid transition).
  useEffect(() => {
    if (status === "paid") {
      void queryClient.invalidateQueries({
        queryKey: getGetMyPtProgramQueryKey(),
      });
    }
  }, [status, queryClient]);

  if (isLoaded && !isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  async function onPay() {
    const me = meQuery.data;
    if (!selected || !validGym) {
      notify("Pick a plan", "Please choose a PT plan to continue.");
      return;
    }
    if (!me?.name || !me?.mobile) {
      notify(
        "Complete your profile",
        "Please add your name and phone number under Account first.",
      );
      return;
    }
    setBusy(true);
    try {
      const created = await createBooking.mutateAsync({
        data: {
          gymId,
          packageId: selected.id,
          name: me.name,
          mobile: me.mobile,
          preferredDate: istDateInNDays(1),
          ...(usePoints && pointsDiscount > 0
            ? { redeemPoints: pointsDiscount }
            : {}),
        },
      });
      if (usePoints) {
        void queryClient.invalidateQueries({
          queryKey: getGetMyReferralInfoQueryKey(),
        });
      }
      setBookingId(created.id);
      await openExternal(created.paymentUrl);
    } catch (err) {
      notify(
        "Could not start payment",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  // ── Post-payment status ────────────────────────────────────────────────
  if (bookingId !== null) {
    const paid = status === "paid";
    const failed = status === "failed";
    return (
      <Screen contentContainerStyle={{ paddingBottom: 40 }}>
        <ModalHeader title="PT plan payment" />
        <Card>
          <View style={{ alignItems: "center", paddingVertical: 24, gap: 12 }}>
            <Feather
              name={paid ? "check-circle" : failed ? "x-circle" : "clock"}
              size={44}
              color={
                paid
                  ? colors.primary
                  : failed
                    ? "#ff6b6b"
                    : colors.mutedForeground
              }
            />
            <AppText weight="700" size={18}>
              {paid
                ? "PT plan booked!"
                : failed
                  ? "Payment failed"
                  : "Waiting for payment…"}
            </AppText>
            <AppText muted size={14} style={{ textAlign: "center" }}>
              {paid
                ? `Your ${selected?.name ?? "PT"} plan is active. Your trainer will now manage your monthly sessions — see them under PT Details.`
                : failed
                  ? "The payment didn't go through. No money was taken — you can try again."
                  : "Complete the payment in the browser window, then come back here."}
            </AppText>
            {paid ? (
              <Button label="Done" onPress={() => router.back()} />
            ) : failed ? (
              <Button
                label="Try again"
                onPress={() => setBookingId(null)}
              />
            ) : null}
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={{ paddingBottom: 40 }}>
      <ModalHeader title="Book your PT plan" />
      <AppText muted size={14} style={{ marginBottom: 16 }}>
        You've finished your Kick Start trial sessions. Choose a PT plan to
        continue with your trainer — monthly sessions start as soon as the
        payment is done.
      </AppText>

      {!validGym ? (
        <EmptyState
          icon="map-pin"
          title="Branch missing"
          message="We couldn't tell which branch you train at. Please contact your trainer."
        />
      ) : packagesQuery.isLoading ? (
        <LoadingView />
      ) : packagesQuery.isError ? (
        <ErrorView onRetry={() => void packagesQuery.refetch()} />
      ) : packages.length === 0 ? (
        <EmptyState
          icon="package"
          title="No PT plans online yet"
          message="Online PT plan booking isn't available for your branch yet. Your trainer will help you at the gym."
        />
      ) : (
        <Card>
          <View style={{ gap: 10, marginBottom: 16 }}>
            {packages.map((p) => (
              <PlanOption
                key={p.id}
                pkg={p}
                selected={p.id === pkgId}
                onPress={() => setPkgId(p.id)}
              />
            ))}
          </View>
          {pointsAvailable > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setUsePoints((v) => !v)}
              style={{
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
                marginBottom: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                borderColor: usePoints ? colors.primary : colors.border,
                backgroundColor: usePoints
                  ? `${colors.primary}14`
                  : "transparent",
              }}
            >
              <Feather
                name={usePoints ? "check-square" : "square"}
                size={18}
                color={usePoints ? colors.primary : colors.mutedForeground}
              />
              <View style={{ flex: 1 }}>
                <AppText weight="700" size={13}>
                  Redeem wallet points
                </AppText>
                <AppText size={12} color={colors.mutedForeground}>
                  {selected
                    ? `Use ${pointsDiscount.toLocaleString("en-IN")} of your ${pointsAvailable.toLocaleString("en-IN")} points (₹1 each)`
                    : `${pointsAvailable.toLocaleString("en-IN")} points available (₹1 each)`}
                </AppText>
              </View>
            </Pressable>
          ) : null}
          <Button
            label={
              selected
                ? `Pay ₹${payable.toLocaleString("en-IN")}`
                : "Pay online"
            }
            onPress={onPay}
            loading={busy}
            icon="credit-card"
          />
          <AppText muted size={11} style={{ marginTop: 10, textAlign: "center" }}>
            Payments are processed securely by Razorpay via the gym's billing
            system.
          </AppText>
        </Card>
      )}
    </Screen>
  );
}

function PlanOption({
  pkg,
  selected,
  onPress,
}: {
  pkg: TrainerPackage;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? `${colors.primary}14` : "transparent",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Feather
        name={selected ? "check-circle" : "circle"}
        size={18}
        color={selected ? colors.primary : colors.mutedForeground}
      />
      <View style={{ flex: 1 }}>
        <AppText weight="700" size={14}>
          {pkg.name}
        </AppText>
        <AppText size={12} color={colors.mutedForeground} style={{ marginTop: 2 }}>
          {[
            pkg.sessions ? `${pkg.sessions} sessions` : "",
            pkg.duration,
          ]
            .filter(Boolean)
            .join(" · ")}
        </AppText>
      </View>
      <AppText weight="700" size={15} color={colors.primary}>
        ₹{pkg.amountInr.toLocaleString("en-IN")}
      </AppText>
    </Pressable>
  );
}
