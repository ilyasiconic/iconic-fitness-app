import { randomUUID } from "node:crypto";
import { db, notificationsTable } from "@workspace/db";

// Member-facing store-order status notifications. Guests (userId 0) have no
// notification feed — silently skipped. Best-effort: never throws (a missed
// notification must not fail the order update itself).

const STATUS_MESSAGES: Record<string, { title: string; body: (id: number) => string }> = {
  placed: {
    title: "Order placed ✅",
    body: (id) =>
      `Payment received — your order #${id} is confirmed. We'll notify you as it moves through packing and shipping.`,
  },
  confirmed: {
    title: "Order confirmed 📦",
    body: (id) => `Your order #${id} has been confirmed and is being prepared.`,
  },
  processing: {
    title: "Order being prepared 📦",
    body: (id) => `Your order #${id} is being prepared for shipping.`,
  },
  shipped: {
    title: "Order shipped 🚚",
    body: (id) => `Your order #${id} is on its way to you.`,
  },
  delivered: {
    title: "Order delivered 🎉",
    body: (id) => `Your order #${id} has been delivered. Enjoy!`,
  },
  cancelled: {
    title: "Order cancelled",
    body: (id) =>
      `Your order #${id} has been cancelled. If you already paid, the amount will be refunded.`,
  },
  payment_failed: {
    title: "Payment failed",
    body: (id) =>
      `The payment for order #${id} didn't go through and no money was captured. You can try ordering again.`,
  },
};

export async function notifyOrderStatus(
  userId: number,
  orderId: number,
  status: string,
): Promise<void> {
  if (!userId || userId <= 0) return;
  const msg = STATUS_MESSAGES[status];
  if (!msg) return;
  try {
    await db.insert(notificationsTable).values({
      recipientType: "user",
      recipientId: userId,
      title: msg.title,
      body: msg.body(orderId),
      link: "/orders",
      batchId: randomUUID(),
    });
  } catch (err) {
    console.error(`[store] order #${orderId} status notification failed:`, err);
  }
}
