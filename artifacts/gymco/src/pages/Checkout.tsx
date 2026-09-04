import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import {
  useGetMyReferralInfo,
  getGetMyReferralInfoQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCart, cartKey } from "@/lib/cart";
import { storeApi } from "@/lib/storeApi";
import { CheckCircle2, ArrowRight, Coins } from "lucide-react";

const INPUT =
  "w-full px-3 py-2.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-lime-500/60";

export default function Checkout() {
  const cart = useCart();
  const { isLoaded, isSignedIn } = useUser();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ orderId: number; total: number } | null>(
    null,
  );
  const [usePoints, setUsePoints] = useState(false);
  const queryClient = useQueryClient();
  // Signed-in members see their wallet points; guests just get a silent 401.
  const { data: referral } = useGetMyReferralInfo({
    query: { queryKey: getGetMyReferralInfoQueryKey(), retry: false },
  });
  const pointsAvailable = referral?.balanceInr ?? 0;
  const pointsDiscount = Math.min(pointsAvailable, cart.subtotal);
  const payable = usePoints ? cart.subtotal - pointsDiscount : cart.subtotal;
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    shippingAddress: "",
    shippingCity: "",
    shippingPincode: "",
  });

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.items.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await storeApi.checkout({
        ...form,
        items: cart.items.map((i) => ({
          productId: i.productId,
          qty: i.qty,
          size: i.size,
          color: i.color,
        })),
        ...(usePoints && pointsDiscount > 0
          ? { redeemPoints: pointsDiscount }
          : {}),
      });
      cart.clear();
      if (usePoints) {
        void queryClient.invalidateQueries({
          queryKey: getGetMyReferralInfoQueryKey(),
        });
      }
      setSuccess({ orderId: result.orderId, total: result.total });
      // Hand off to the secure Airpay payment page (UPI / cards / netbanking).
      window.location.assign(result.paymentUrl);
      return; // keep the button disabled while the browser navigates away
    } catch (e: any) {
      setErr(e?.message ?? "Checkout failed");
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <div className="py-16 text-center max-w-md mx-auto">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-500/15 text-emerald-500 mb-4">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="text-3xl font-black tracking-tight">Order placed!</h1>
        <p className="text-muted-foreground mt-2">
          Order #{success.orderId} — ₹{success.total.toLocaleString("en-IN")}
        </p>
        <p className="text-sm text-muted-foreground mt-3">
          Taking you to the secure payment page… Your order is confirmed once the
          payment goes through.
        </p>
        <Link
          href="/store"
          className="inline-flex items-center gap-2 mt-6 px-5 py-3 rounded-xl bg-gradient-brand text-white font-bold"
        >
          Continue shopping <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  // Login is required to order — the order then shows in My Orders and the
  // member gets status notifications. While Clerk is still loading we show a
  // spinner instead of the form, so guests never see a submittable checkout.
  if (!isLoaded) {
    return (
      <div className="py-20 text-center text-muted-foreground">Loading…</div>
    );
  }
  if (!isSignedIn) {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <h1 className="text-3xl font-black tracking-tight">Please sign in</h1>
        <p className="text-muted-foreground mt-3">
          Log in to place your order — you'll get order updates and can track
          it anytime in My Orders. Your cart is saved.
        </p>
        <Link
          href="/sign-in"
          className="inline-flex items-center gap-2 mt-6 px-5 py-3 rounded-xl bg-gradient-brand text-white font-bold"
        >
          Sign in to continue <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Your cart is empty.</p>
        <Link
          href="/store"
          className="inline-block mt-4 text-sm font-semibold text-lime-500 hover:underline"
        >
          Browse the store
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-6">Checkout</h1>
      <form onSubmit={submit} className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 rounded-2xl bg-card border border-border space-y-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
            Delivery details
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-muted-foreground">Full name</span>
              <input
                required
                value={form.customerName}
                onChange={update("customerName")}
                className={INPUT + " mt-1"}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Phone</span>
              <input
                required
                type="tel"
                value={form.customerPhone}
                onChange={update("customerPhone")}
                className={INPUT + " mt-1"}
                placeholder="+91 …"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs text-muted-foreground">Email</span>
              <input
                required
                type="email"
                value={form.customerEmail}
                onChange={update("customerEmail")}
                className={INPUT + " mt-1"}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs text-muted-foreground">Address</span>
              <textarea
                required
                value={form.shippingAddress}
                onChange={update("shippingAddress")}
                rows={3}
                className={INPUT + " mt-1 resize-none"}
                placeholder="House / flat, street, area, landmark"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">City</span>
              <input
                required
                value={form.shippingCity}
                onChange={update("shippingCity")}
                className={INPUT + " mt-1"}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Pincode</span>
              <input
                required
                value={form.shippingPincode}
                onChange={update("shippingPincode")}
                className={INPUT + " mt-1"}
                pattern="\d{6}"
                title="6-digit pincode"
              />
            </label>
          </div>

          <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold pt-2">
            Payment method
          </div>
          <div className="p-3 rounded-lg border-2 border-lime-500/60 bg-lime-500/5">
            <div className="font-bold text-foreground">Pay Online</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              UPI, cards or netbanking on the secure payment page after you place
              the order. GST &amp; shipping (if any) are added at checkout.
            </div>
          </div>

          {err && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              {err}
            </div>
          )}
        </div>
        <aside className="p-5 rounded-2xl bg-card border border-border h-fit">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-3">
            Your order
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {cart.items.map((i) => {
              const variant = [i.size, i.color].filter(Boolean).join(" / ");
              return (
              <div key={cartKey(i)} className="flex items-center gap-2 text-sm">
                <div className="w-10 h-10 rounded bg-muted overflow-hidden shrink-0">
                  <img src={i.imageUrl} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-foreground">{i.name}</div>
                  {variant && (
                    <div className="text-xs font-semibold text-primary">{variant}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Qty {i.qty} · ₹{i.priceInr.toLocaleString("en-IN")}
                  </div>
                </div>
                <div className="font-semibold">
                  ₹{(i.priceInr * i.qty).toLocaleString("en-IN")}
                </div>
              </div>
              );
            })}
          </div>
          {pointsAvailable > 0 && (
            <label className="flex items-start gap-2.5 mt-3 p-3 rounded-lg border border-lime-500/40 bg-lime-500/5 cursor-pointer">
              <input
                type="checkbox"
                checked={usePoints}
                onChange={(e) => setUsePoints(e.target.checked)}
                className="h-4 w-4 mt-0.5 accent-lime-500"
              />
              <span className="text-sm">
                <span className="font-semibold text-foreground inline-flex items-center gap-1.5">
                  <Coins className="h-4 w-4 text-lime-500" /> Use wallet points
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  You have {pointsAvailable.toLocaleString("en-IN")} points (₹
                  {pointsAvailable.toLocaleString("en-IN")}). Up to ₹
                  {pointsDiscount.toLocaleString("en-IN")} will be applied to this
                  order.
                </span>
              </span>
            </label>
          )}
          <div className="pt-3 mt-3 border-t border-border space-y-1">
            {usePoints && pointsDiscount > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Points discount</span>
                <span className="text-lime-500 font-semibold">
                  −₹{pointsDiscount.toLocaleString("en-IN")}
                </span>
              </div>
            )}
            <div className="flex justify-between items-baseline">
              <span className="font-bold">Total</span>
              <span className="text-2xl font-extrabold">
                ₹{payable.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-brand text-white font-bold shadow-[0_8px_24px_-8px_hsl(91_56%_55%/0.7)] hover:opacity-95 disabled:opacity-50"
          >
            {busy ? "Placing order…" : "Place order & pay"}
          </button>
        </aside>
      </form>
    </div>
  );
}
