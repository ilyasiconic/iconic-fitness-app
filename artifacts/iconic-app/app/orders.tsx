import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getListMyStoreOrdersQueryKey,
  useListMyStoreOrders,
  type StoreOrder,
} from "@workspace/api-client-react";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ModalHeader } from "@/components/ModalHeader";
import { EmptyState, ErrorView, LoadingView } from "@/components/ui-bits";
import { useColors } from "@/hooks/useColors";

const TRACK_STEPS = ["placed", "confirmed", "shipped", "delivered"] as const;

const STATUS_LABEL: Record<string, string> = {
  placed: "Order placed",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export default function OrdersScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const ordersQuery = useListMyStoreOrders({
    query: {
      enabled: !!isSignedIn,
      queryKey: getListMyStoreOrdersQueryKey(),
    },
  });

  if (isLoaded && !isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ModalHeader title="My orders" />
      {ordersQuery.isLoading || !isLoaded ? (
        <LoadingView />
      ) : ordersQuery.isError ? (
        <ErrorView onRetry={() => void ordersQuery.refetch()} />
      ) : (ordersQuery.data ?? []).length === 0 ? (
        <View style={{ flex: 1 }}>
          <EmptyState
            icon="package"
            title="No orders yet"
            message="Your store orders and delivery tracking will show up here."
          />
          <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
            <Button
              label="Shop the store"
              icon="shopping-bag"
              onPress={() => router.push("/(tabs)/store")}
            />
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 32,
            gap: 14,
          }}
          refreshControl={
            <RefreshControl
              refreshing={ordersQuery.isRefetching}
              onRefresh={() => void ordersQuery.refetch()}
              tintColor={colors.primary}
            />
          }
        >
          {((ordersQuery.data ?? []) as StoreOrder[]).map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function OrderCard({ order }: { order: StoreOrder }) {
  const colors = useColors();
  const cancelled =
    order.status === "cancelled" || order.status === "payment_failed";
  const awaitingPayment = order.status === "payment_pending";
  const stepIdx = TRACK_STEPS.indexOf(
    order.status as (typeof TRACK_STEPS)[number],
  );
  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.rowBetween}>
        <AppText weight="700" size={15}>
          Order #{order.id}
        </AppText>
        <AppText muted size={12}>
          {formatDate(order.createdAt)}
        </AppText>
      </View>

      {/* Items */}
      <View style={{ gap: 6 }}>
        {order.items.map((i: StoreOrder["items"][number]) => (
          <View key={i.id} style={styles.rowBetween}>
            <AppText size={13} style={{ flex: 1 }} numberOfLines={1}>
              {i.productName}
              {i.variant ? ` (${i.variant})` : ""} × {i.qty}
            </AppText>
            <AppText weight="600" size={13}>
              ₹{i.unitPriceInr * i.qty}
            </AppText>
          </View>
        ))}
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Invoice breakdown (orders placed after GST/shipping went live) */}
      {(order.subtotalInr ?? 0) > 0 && (
        <View style={{ gap: 4 }}>
          <View style={styles.rowBetween}>
            <AppText muted size={13}>Subtotal</AppText>
            <AppText size={13}>₹{order.subtotalInr}</AppText>
          </View>
          {(order.cgstInr ?? 0) > 0 && (
            <View style={styles.rowBetween}>
              <AppText muted size={13}>CGST</AppText>
              <AppText size={13}>₹{order.cgstInr}</AppText>
            </View>
          )}
          {(order.sgstInr ?? 0) > 0 && (
            <View style={styles.rowBetween}>
              <AppText muted size={13}>SGST</AppText>
              <AppText size={13}>₹{order.sgstInr}</AppText>
            </View>
          )}
          {(order.shippingInr ?? 0) > 0 && (
            <View style={styles.rowBetween}>
              <AppText muted size={13}>Shipping</AppText>
              <AppText size={13}>₹{order.shippingInr}</AppText>
            </View>
          )}
          {order.pointsRedeemedInr > 0 && (
            <View style={styles.rowBetween}>
              <AppText muted size={13}>Points discount</AppText>
              <AppText size={13}>−₹{order.pointsRedeemedInr}</AppText>
            </View>
          )}
        </View>
      )}

      <View style={styles.rowBetween}>
        <AppText muted size={13}>
          {order.paymentMethod === "cod"
            ? "Cash on delivery"
            : order.paymentMethod === "online"
              ? "Paid online"
              : order.paymentMethod}
          {(order.subtotalInr ?? 0) === 0 && order.pointsRedeemedInr > 0
            ? ` · ₹${order.pointsRedeemedInr} points used`
            : ""}
        </AppText>
        <AppText weight="700" size={15}>
          Total ₹{order.totalInr}
        </AppText>
      </View>

      {/* Tracking */}
      {cancelled ? (
        <View
          style={[
            styles.cancelBanner,
            { backgroundColor: `${colors.destructive}22` },
          ]}
        >
          <Feather name="x-circle" size={16} color={colors.destructive} />
          <AppText weight="600" size={13} style={{ color: colors.destructive }}>
            {order.status === "payment_failed"
              ? "Payment failed — this order wasn't placed"
              : "This order was cancelled"}
          </AppText>
        </View>
      ) : awaitingPayment ? (
        <View
          style={[styles.cancelBanner, { backgroundColor: colors.elevated }]}
        >
          <Feather name="clock" size={16} color={colors.mutedForeground} />
          <AppText muted weight="600" size={13}>
            Waiting for payment — the order is confirmed once paid
          </AppText>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <View style={styles.trackRow}>
            {TRACK_STEPS.map((step, i) => {
              const done = stepIdx >= i;
              return (
                <View key={step} style={styles.trackStep}>
                  <View
                    style={[
                      styles.trackDot,
                      {
                        backgroundColor: done ? colors.primary : colors.elevated,
                        borderColor: done ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    {done ? (
                      <Feather
                        name="check"
                        size={11}
                        color={colors.primaryForeground}
                      />
                    ) : null}
                  </View>
                  {i < TRACK_STEPS.length - 1 ? (
                    <View
                      style={[
                        styles.trackLine,
                        {
                          backgroundColor:
                            stepIdx > i ? colors.primary : colors.border,
                        },
                      ]}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
          <View style={styles.trackLabels}>
            {TRACK_STEPS.map((step, i) => (
              <AppText
                key={step}
                size={10}
                weight={stepIdx === i ? "700" : "500"}
                muted={stepIdx < i}
                style={{ flex: 1, textAlign: i === 0 ? "left" : i === TRACK_STEPS.length - 1 ? "right" : "center" }}
              >
                {STATUS_LABEL[step]}
              </AppText>
            ))}
          </View>
        </View>
      )}

      {/* Delivery address */}
      {order.shippingAddress ? (
        <AppText muted size={12}>
          Deliver to: {order.shippingAddress}, {order.shippingCity}{" "}
          {order.shippingPincode}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  divider: { height: StyleSheet.hairlineWidth },
  cancelBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  trackStep: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  trackDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  trackLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
  },
  trackLabels: {
    flexDirection: "row",
    gap: 4,
  },
});
