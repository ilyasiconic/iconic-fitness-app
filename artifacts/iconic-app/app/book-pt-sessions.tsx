import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import {
  getGetMeQueryKey,
  getGetTrainerBookingQueryKey,
  getListTrainerPackagesQueryKey,
  useCreateTrainerBooking,
  useGetMe,
  useGetTrainerBooking,
  useListTrainerPackages,
  type TrainerPackage,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Field } from "@/components/Field";
import { CouponInput, type AppliedCoupon } from "@/components/CouponInput";
import { ModalHeader } from "@/components/ModalHeader";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorView, LoadingView } from "@/components/ui-bits";
import { CalendarPicker } from "@/components/DateTimePickers";
import { useColors } from "@/hooks/useColors";
import { istDateLabel, istToday } from "@/lib/dates";
import { openPayment } from "@/lib/links";

// Paid PT session packages for the member's branch: live prices from the
// gym-management system, hosted Razorpay checkout, and a booking row that
// lands on the partner's PT Bookings page for trainer assignment.
export default function BookPtSessionsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { isLoaded, isSignedIn } = useAuth();
  const params = useLocalSearchParams<{ gymId?: string; gymName?: string }>();
  const gymId = Number(params.gymId);
  const hasGym = Number.isFinite(gymId) && gymId > 0;
  const gymName = (params.gymName ?? "").trim();

  const pkgParams = hasGym ? { gymId } : { gymId: 0 };
  const packagesQuery = useListTrainerPackages(pkgParams, {
    query: {
      enabled: hasGym,
      queryKey: getListTrainerPackagesQueryKey(pkgParams),
    },
  });
  // Personal-training packages only — this screen isn't for gym memberships.
  // The billing system's PT flag is authoritative, but branches often name
  // PT packages without setting the flag, so also match by name.
  const packages = useMemo(
    () =>
      (packagesQuery.data ?? []).filter(
        (p) =>
          p.pt ||
          /(\bpt\b|personal\s*train)/i.test(`${p.serviceName} ${p.name}`),
      ),
    [packagesQuery.data],
  );
  // Explicit tri-state gating so members never see the wrong branch of the
  // flow while the price list is still loading (see book-package.tsx).
  const settled = hasGym && packagesQuery.isSuccess;
  const failed = hasGym && packagesQuery.isError;
  const paidFlow = settled && packages.length > 0;

  const meQuery = useGetMe({
    query: {
      enabled: isLoaded && !!isSignedIn,
      queryKey: getGetMeQueryKey(),
    },
  });

  const [pkgId, setPkgId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(istToday());
  const [busy, setBusy] = useState(false);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [bookingId, setBookingId] = useState<number | null>(null);
  // Keep the hosted checkout link so the member can re-open it if they
  // closed the payment window before finishing.
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

  useEffect(() => {
    const me = meQuery.data;
    if (!me) return;
    setName((prev) => (prev ? prev : (me.name ?? "")));
    setPhone((prev) => (prev ? prev : (me.mobile ?? "")));
  }, [meQuery.data]);

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
  const selectedPkg = packages.find((p) => p.id === pkgId) ?? null;

  // Coupon leaves at least ₹1 payable; the server re-validates at checkout.
  const payableInr = selectedPkg
    ? Math.max(1, selectedPkg.amountInr - (coupon?.discountInr ?? 0))
    : 0;

  // A coupon is validated against one package's price — reset it if the
  // member switches packages.
  useEffect(() => {
    setCoupon(null);
  }, [pkgId]);

  function validateContact(): boolean {
    if (name.trim().length < 2) {
      Alert.alert("Name required", "Please enter your full name.");
      return false;
    }
    if (!/^[+0-9 ()-]{7,}$/.test(phone.trim())) {
      Alert.alert("Phone required", "Please enter a valid phone number.");
      return false;
    }
    return true;
  }

  async function onPay() {
    if (!hasGym || !selectedPkg) {
      Alert.alert("Pick a package", "Please choose a PT package to continue.");
      return;
    }
    if (!validateContact()) return;
    setBusy(true);
    try {
      const created = await createBooking.mutateAsync({
        data: {
          gymId,
          packageId: selectedPkg.id,
          name: name.trim(),
          mobile: phone.trim(),
          preferredDate: date,
          ...(coupon ? { couponCode: coupon.code } : {}),
        },
      });
      setBookingId(created.id);
      setPaymentUrl(created.paymentUrl);
      await openPayment(created.paymentUrl);
    } catch (err) {
      Alert.alert(
        "Could not start payment",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  // ── Post-payment status ───────────────────────────────────────────────────
  if (bookingId !== null) {
    const paid = status === "paid";
    const failedPay = status === "failed";
    return (
      <Screen contentContainerStyle={{ paddingBottom: 40 }}>
        <ModalHeader title="Payment" />
        <Card>
          <View style={{ alignItems: "center", paddingVertical: 24, gap: 12 }}>
            <Feather
              name={paid ? "check-circle" : failedPay ? "x-circle" : "clock"}
              size={44}
              color={
                paid
                  ? colors.primary
                  : failedPay
                    ? "#ff6b6b"
                    : colors.mutedForeground
              }
            />
            <AppText weight="700" size={18}>
              {paid
                ? "Payment successful"
                : failedPay
                  ? "Payment failed"
                  : "Waiting for payment…"}
            </AppText>
            <AppText muted size={14} style={{ textAlign: "center" }}>
              {paid
                ? `Your ${selectedPkg?.name ?? "PT"} package is booked${gymName ? ` at ${gymName}` : ""}. Your invoice will appear under Invoices, and the team will assign your trainer shortly.`
                : failedPay
                  ? "The payment didn't go through. No money was taken — you can try again."
                  : "Complete the payment in the browser window, then come back here."}
            </AppText>
            {paid ? (
              <View style={{ gap: 10, alignSelf: "stretch" }}>
                <Button
                  label="View invoices"
                  onPress={() => router.replace("/invoices")}
                  icon="file-text"
                />
                <Button label="Done" onPress={() => router.back()} />
              </View>
            ) : failedPay ? (
              <Button
                label="Try again"
                onPress={() => {
                  setBookingId(null);
                  setPaymentUrl(null);
                }}
              />
            ) : (
              // Still pending (or the status check itself is failing) — give
              // the member ways out instead of an indefinite spinner.
              <View style={{ gap: 10, alignSelf: "stretch", marginTop: 4 }}>
                {statusQuery.isError ? (
                  <AppText muted size={12} style={{ textAlign: "center" }}>
                    We couldn't check the payment status just now.
                  </AppText>
                ) : null}
                <Button
                  label="Check payment status"
                  onPress={() => void statusQuery.refetch()}
                  loading={statusQuery.isFetching}
                  icon="refresh-cw"
                />
                {paymentUrl ? (
                  <Button
                    label="Re-open payment page"
                    onPress={() => void openPayment(paymentUrl)}
                    icon="external-link"
                  />
                ) : null}
                <Button
                  label="Cancel and go back"
                  onPress={() => {
                    setBookingId(null);
                    setPaymentUrl(null);
                  }}
                />
              </View>
            )}
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshing={packagesQuery.isRefetching}
      onRefresh={() => void packagesQuery.refetch()}
    >
      <ModalHeader title="Book your PT sessions" />

      {gymName ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 12,
          }}
        >
          <Feather name="map-pin" size={14} color={colors.primary} />
          <AppText weight="600" size={13} color={colors.primary}>
            {gymName}
          </AppText>
        </View>
      ) : null}

      {!hasGym ? (
        <EmptyState
          icon="map-pin"
          title="Pick a branch first"
          message="Open Personal Trainers and choose your branch to see PT prices."
        />
      ) : failed ? (
        <ErrorView onRetry={() => void packagesQuery.refetch()} />
      ) : !settled ? (
        <Card>
          <LoadingView />
          <AppText muted size={13} style={{ textAlign: "center", marginTop: 8 }}>
            Loading PT prices for {gymName || "your branch"}…
          </AppText>
        </Card>
      ) : !paidFlow ? (
        <Card>
          <AppText weight="700" size={16} style={{ marginBottom: 4 }}>
            Online PT booking isn't available here yet
          </AppText>
          <AppText muted size={13} style={{ marginBottom: 16 }}>
            {gymName || "This branch"} hasn't published PT packages for online
            purchase. Send a session request instead and the team will help
            you.
          </AppText>
          <Button
            label="Request a PT session"
            icon="send"
            onPress={() =>
              // Plain PT session enquiry — NOT the free trial flow, so the
              // team sees it as a paid-PT interest request.
              router.replace({
                pathname: "/book-trainer",
                params: {
                  gymId: String(gymId),
                  gymName,
                },
              })
            }
          />
        </Card>
      ) : isLoaded && !isSignedIn ? (
        // Paid PT bookings are account-bound server-side — send guests to
        // log in first instead of letting the payment call fail.
        <Card>
          <AppText weight="700" size={16} style={{ marginBottom: 4 }}>
            Log in to book PT sessions
          </AppText>
          <AppText muted size={13} style={{ marginBottom: 16 }}>
            PT bookings are linked to your account so your invoice and trainer
            assignment show up in the app. Please log in to continue.
          </AppText>
          <Button
            label="Log in"
            icon="log-in"
            onPress={() => router.push("/(auth)/welcome")}
          />
        </Card>
      ) : (
        <Card>
          <AppText weight="700" size={16} style={{ marginBottom: 4 }}>
            Choose your PT package
          </AppText>
          <AppText muted size={13} style={{ marginBottom: 16 }}>
            Pay securely online — once the payment lands, the team assigns
            your trainer and your sessions begin.
          </AppText>

          <View style={{ gap: 10, marginBottom: 16 }}>
            {packages.map((p) => (
              <PtPackageOption
                key={p.id}
                pkg={p}
                selected={p.id === pkgId}
                onPress={() => setPkgId(p.id)}
              />
            ))}
          </View>

          <Field
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            autoCapitalize="words"
          />
          <View style={{ height: 12 }} />
          <Field
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="Your phone number"
            keyboardType="phone-pad"
          />

          <AppText
            weight="600"
            size={13}
            style={{ marginTop: 18, marginBottom: 8 }}
          >
            Start date
          </AppText>
          <CalendarPicker value={date} onChange={setDate} />
          <AppText muted size={11} style={{ marginTop: 6 }}>
            Selected: {istDateLabel(date)}
          </AppText>

          <CouponInput
            amountInr={selectedPkg ? selectedPkg.amountInr : null}
            kind="pt"
            mobile={phone}
            applied={coupon}
            onApplied={setCoupon}
          />

          <View style={{ marginTop: 20 }}>
            <Button
              label={
                selectedPkg
                  ? `Pay ₹${payableInr.toLocaleString("en-IN")}`
                  : "Pay online"
              }
              onPress={onPay}
              loading={busy}
              icon="credit-card"
            />
          </View>
          <AppText muted size={11} style={{ marginTop: 10, textAlign: "center" }}>
            Payments are processed securely by Razorpay via the gym's billing
            system.
          </AppText>
        </Card>
      )}
    </Screen>
  );
}

function PtPackageOption({
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
    <Pressable onPress={onPress}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 14,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? `${colors.primary}14` : "transparent",
        }}
      >
        <Feather
          name={selected ? "check-circle" : "circle"}
          size={20}
          color={selected ? colors.primary : colors.mutedForeground}
        />
        <View style={{ flex: 1 }}>
          <AppText weight="700" size={15}>
            {pkg.name}
          </AppText>
          <AppText muted size={12} style={{ marginTop: 2 }}>
            {[
              pkg.sessions ? `${pkg.sessions} sessions` : null,
              pkg.duration || null,
            ]
              .filter(Boolean)
              .join(" · ") || pkg.serviceName}
          </AppText>
          {pkg.description ? (
            <AppText muted size={12} style={{ marginTop: 2 }}>
              {pkg.description}
            </AppText>
          ) : null}
        </View>
        <AppText weight="700" size={16} color={colors.primary}>
          ₹{pkg.amountInr.toLocaleString("en-IN")}
        </AppText>
      </View>
    </Pressable>
  );
}
