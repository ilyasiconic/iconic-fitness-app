import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getGetMeQueryKey,
  getGetMyReferralInfoQueryKey,
  getListMyStoreOrdersQueryKey,
  useGetMe,
  useGetMyReferralInfo,
  useStoreCheckout,
} from "@workspace/api-client-react";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Field } from "@/components/Field";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ModalHeader } from "@/components/ModalHeader";
import { EmptyState } from "@/components/ui-bits";
import { useColors } from "@/hooks/useColors";
import { cartKey, useCart } from "@/lib/cart";
import { resolveImageUrl } from "@/lib/images";
import { openPayment } from "@/lib/links";

export default function CartScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSignedIn } = useAuth();
  const { items, setQty, remove, clear, totalInr } = useCart();

  const me = useGetMe({
    query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() },
  });
  const referral = useGetMyReferralInfo({
    query: { enabled: !!isSignedIn, queryKey: getGetMyReferralInfoQueryKey() },
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [usePoints, setUsePoints] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<number | null>(null);

  // Prefill contact details from the member profile once it loads.
  useEffect(() => {
    const u = me.data;
    if (!u) return;
    setName((v) => v || u.name || "");
    setEmail((v) => v || u.email || "");
    setPhone((v) => v || u.mobile || "");
  }, [me.data]);

  const checkout = useStoreCheckout();

  const balance = referral.data?.balanceInr ?? 0;
  // Keep at least ₹1 payable — the online payment page needs a real charge.
  const pointsDiscount = usePoints
    ? Math.min(balance, Math.max(totalInr - 1, 0))
    : 0;
  const payable = totalInr - pointsDiscount;

  const onPlaceOrder = async () => {
    // Login is required to order — the order then shows in My Orders and the
    // member gets status notifications. (Alert.alert with buttons is a no-op
    // on react-native-web, so the web build uses window.confirm.)
    if (!isSignedIn) {
      const msg =
        "Please log in to place your order — you'll get order updates and can track it in My Orders.";
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        if (window.confirm(`Login required\n${msg}`)) {
          router.push("/(auth)/welcome");
        }
      } else {
        Alert.alert("Login required", msg, [
          { text: "Cancel", style: "cancel" },
          { text: "Log in", onPress: () => router.push("/(auth)/welcome") },
        ]);
      }
      return;
    }
    if (name.trim().length < 2) {
      Alert.alert("Name required", "Please enter your full name.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      Alert.alert("Email required", "Please enter a valid email address.");
      return;
    }
    if (!/^[+0-9 ()-]{7,}$/.test(phone.trim())) {
      Alert.alert("Phone required", "Please enter a valid phone number.");
      return;
    }
    if (address.trim().length < 5) {
      Alert.alert("Address required", "Please enter your delivery address.");
      return;
    }
    if (!city.trim()) {
      Alert.alert("City required", "Please enter your city.");
      return;
    }
    if (!/^\d{6}$/.test(pincode.trim())) {
      Alert.alert("Pincode required", "Please enter a valid 6-digit pincode.");
      return;
    }
    try {
      const res = await checkout.mutateAsync({
        data: {
          customerName: name.trim(),
          customerEmail: email.trim(),
          customerPhone: phone.trim(),
          shippingAddress: address.trim(),
          shippingCity: city.trim(),
          shippingPincode: pincode.trim(),
          ...(isSignedIn && pointsDiscount > 0
            ? { redeemPoints: pointsDiscount }
            : {}),
          items: items.map((i) => ({
            productId: i.productId,
            qty: i.qty,
            ...(i.size ? { size: i.size } : {}),
            ...(i.color ? { color: i.color } : {}),
          })),
        },
      });
      clear();
      setPlacedOrderId(res.orderId);
      void queryClient.invalidateQueries({
        queryKey: getListMyStoreOrdersQueryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: getGetMyReferralInfoQueryKey(),
      });
      // Hand off to the secure payment page (UPI / cards / netbanking) in the
      // system browser; it deep-links back into the app when done.
      await openPayment(res.paymentUrl);
    } catch (err) {
      Alert.alert(
        "Could not place order",
        err instanceof Error ? err.message : "Please try again.",
      );
    }
  };

  if (placedOrderId !== null) {
    return (
      <Shell>
        <View style={styles.successWrap}>
          <View style={[styles.successIcon, { backgroundColor: colors.primary }]}>
            <Feather name="check" size={36} color={colors.primaryForeground} />
          </View>
          <AppText weight="700" size={22} style={{ textAlign: "center" }}>
            Complete your payment
          </AppText>
          <AppText muted size={14} style={{ textAlign: "center" }}>
            Order #{placedOrderId} — finish the payment in the browser window
            that just opened. Your order is confirmed as soon as the payment
            goes through.
          </AppText>
          {isSignedIn ? (
            <Button
              label="Track my order"
              icon="package"
              onPress={() => {
                setPlacedOrderId(null);
                router.replace("/orders");
              }}
            />
          ) : null}
          <Button
            label="Continue shopping"
            variant="secondary"
            onPress={() => {
              setPlacedOrderId(null);
              router.back();
            }}
          />
        </View>
      </Shell>
    );
  }

  if (items.length === 0) {
    return (
      <Shell>
        <EmptyState
          icon="shopping-cart"
          title="Your cart is empty"
          message="Browse the store and add something you like."
        />
        <View style={{ paddingHorizontal: 20 }}>
          <Button label="Back to store" onPress={() => router.back()} />
        </View>
      </Shell>
    );
  }

  return (
    <Shell>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 12 }}
      >
        {items.map((i) => {
          const key = cartKey(i);
          return (
            <Card key={key} style={styles.line}>
              <Image
                source={{ uri: resolveImageUrl(i.imageUrl) }}
                style={[styles.lineImage, { backgroundColor: colors.elevated }]}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText weight="600" size={14} numberOfLines={2}>
                  {i.name}
                </AppText>
                {i.size || i.color ? (
                  <AppText muted size={12}>
                    {[i.size, i.color].filter(Boolean).join(" / ")}
                  </AppText>
                ) : null}
                <AppText weight="700" size={15}>
                  ₹{i.priceInr * i.qty}
                </AppText>
              </View>
              <View style={{ alignItems: "center", gap: 6 }}>
                <View style={styles.qtyRow}>
                  <Pressable
                    onPress={() => setQty(key, i.qty - 1)}
                    style={[styles.qtyBtn, { backgroundColor: colors.elevated }]}
                  >
                    <AppText weight="700" size={16}>−</AppText>
                  </Pressable>
                  <AppText weight="700" size={14} style={{ minWidth: 24, textAlign: "center" }}>
                    {i.qty}
                  </AppText>
                  <Pressable
                    onPress={() => setQty(key, i.qty + 1)}
                    style={[styles.qtyBtn, { backgroundColor: colors.elevated }]}
                  >
                    <AppText weight="700" size={16}>+</AppText>
                  </Pressable>
                </View>
                <Pressable onPress={() => remove(key)} hitSlop={8}>
                  <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </Card>
          );
        })}

        {/* Delivery details */}
        <AppText weight="700" size={17} style={{ marginTop: 10 }}>
          Delivery details
        </AppText>
        <Field label="Full name" value={name} onChangeText={setName} />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Field
          label="Address"
          value={address}
          onChangeText={setAddress}
          multiline
        />
        <Field label="City" value={city} onChangeText={setCity} />
        <Field
          label="Pincode"
          value={pincode}
          onChangeText={setPincode}
          keyboardType="number-pad"
          maxLength={6}
        />

        {isSignedIn ? (
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <AppText weight="600" size={14}>
                Use wallet points
              </AppText>
              <AppText muted size={12}>
                {balance > 0
                  ? `Balance ₹${balance} — save ₹${Math.min(balance, totalInr)} on this order`
                  : "You have 0 points. Earn points by referring friends — 1 point = ₹1 off."}
              </AppText>
            </View>
            <Switch
              value={usePoints && balance > 0}
              disabled={balance <= 0}
              onValueChange={setUsePoints}
              trackColor={{ true: colors.primary, false: colors.elevated }}
              thumbColor="#fff"
            />
          </Card>
        ) : null}

        {/* Summary */}
        <Card style={{ gap: 8 }}>
          <Row label="Items total" value={`₹${totalInr}`} />
          {pointsDiscount > 0 ? (
            <Row label="Points discount" value={`−₹${pointsDiscount}`} />
          ) : null}
          <Row label="Payment" value="Online (UPI / card)" />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Row label="To pay" value={`₹${payable} + GST & shipping`} bold />
          <AppText muted size={11}>
            GST and shipping (if any) are added on the payment page. Your order
            bill shows the full breakup.
          </AppText>
        </Card>

        <Button
          label={checkout.isPending ? "Starting payment…" : `Pay ₹${payable} + GST & shipping`}
          icon="check-circle"
          loading={checkout.isPending}
          onPress={() => void onPlaceOrder()}
        />
      </KeyboardAwareScrollViewCompat>
    </Shell>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <AppText muted={!bold} weight={bold ? "700" : "500"} size={bold ? 16 : 14}>
        {label}
      </AppText>
      <AppText weight={bold ? "700" : "600"} size={bold ? 16 : 14}>
        {value}
      </AppText>
    </View>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ModalHeader title="Cart" />
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  lineImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  successWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 16,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
