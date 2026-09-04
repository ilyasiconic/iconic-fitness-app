import { randomBytes, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, gymsTable, packageBookingsTable, usersTable } from "@workspace/db";
import {
  ListMembershipPackagesQueryParams,
  ListMembershipPackagesResponse,
  CreatePackageBookingBody,
  CreatePackageBookingResponse,
  GetPackageBookingParams,
  GetPackageBookingResponse,
  ListMyPackageBookingsResponse,
} from "@workspace/api-zod";
import { optionalUser, requireUser } from "../lib/currentUser";
import { microCache } from "../lib/microCache";
import {
  creditReferralRewardOnce,
  debitWallet,
  walletBalance,
} from "../lib/referrals";
import {
  applyPackagePref,
  isPackageVisible,
  packagePrefs,
} from "../lib/yoactivPackagePrefs";
import {
  createYoactivPaymentUrl,
  ensureYoactivMemberId,
  fetchYoactivPackages,
  invalidateYoactivMemberCache,
  normalizeMobile,
  resolveBranchTarget,
  yoactivConfigured,
} from "../lib/yoactiv";
import { quoteCoupon, recordCouponRedemption } from "../lib/coupons";

const router: IRouter = Router();

/** Absolute public base URL for payment redirect landings. */
function publicBaseUrl(req: Request): string {
  const domains = (process.env.REPLIT_DOMAINS ?? "").split(",");
  const domain =
    domains[0]?.trim() || process.env.REPLIT_DEV_DOMAIN?.trim() || req.get("host");
  return `https://${domain}`;
}

// Purchasable membership packages (live prices) for a branch: every paid
// non-PT service variation, cheapest first.
router.get("/membership-packages", microCache(30_000), async (req, res): Promise<void> => {
  const parsed = ListMembershipPackagesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!yoactivConfigured()) {
    res.json(ListMembershipPackagesResponse.parse([]));
    return;
  }
  const [gym] = await db
    .select({ yoactivBranchId: gymsTable.yoactivBranchId })
    .from(gymsTable)
    .where(eq(gymsTable.id, parsed.data.gymId));
  // No branch mapping → no paid packages; the app falls back to enquiries.
  if (!gym?.yoactivBranchId) {
    res.json(ListMembershipPackagesResponse.parse([]));
    return;
  }
  const [all, prefs] = await Promise.all([
    fetchYoactivPackages(gym.yoactivBranchId),
    packagePrefs(gym.yoactivBranchId),
  ]);
  const memberships = all
    .filter((p) => !p.pt && isPackageVisible(p.id, prefs))
    .map((p) => applyPackagePref(p, prefs))
    .sort((a, b) => a.amountInr - b.amountInr);
  res.json(ListMembershipPackagesResponse.parse(memberships));
});

// Start a paid package purchase: verify the package server-side, register the
// member in the gym-management system if needed, create a pending purchase row,
// and hand back YoActiv's hosted Razorpay payment link (valid ~5 minutes).
// Guests can buy too (name + mobile identify them in the gym system); signed-in
// members get the purchase attached to their account.
router.post(
  "/package-bookings",
  optionalUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreatePackageBookingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const body = parsed.data;
    if (!yoactivConfigured()) {
      res.status(503).json({ error: "Payments are temporarily unavailable" });
      return;
    }
    const mobile = normalizeMobile(body.mobile);
    if (!mobile) {
      res.status(400).json({ error: "Please enter a valid 10-digit mobile number" });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)) {
      res.status(400).json({ error: "Invalid start date" });
      return;
    }
    // Signed-in members must have a profile photo before paying — it goes on
    // their member card. (Guests are identified in the gym system by
    // name+mobile and add a photo after signing in.)
    if (req.userId) {
      const [me] = await db
        .select({ avatarUrl: usersTable.avatarUrl })
        .from(usersTable)
        .where(eq(usersTable.id, req.userId));
      if (me && !me.avatarUrl.trim()) {
        res.status(400).json({
          error:
            "Please add your profile photo before payment — it will appear on your member card.",
        });
        return;
      }
    }
    const [gym] = await db
      .select({
        id: gymsTable.id,
        name: gymsTable.name,
        yoactivBranchId: gymsTable.yoactivBranchId,
      })
      .from(gymsTable)
      .where(eq(gymsTable.id, body.gymId));
    if (!gym) {
      res.status(404).json({ error: "Branch not found" });
      return;
    }
    const target = await resolveBranchTarget(gym.yoactivBranchId);
    if (!target) {
      res.status(409).json({
        error: "Online payment isn't available for this branch yet",
      });
      return;
    }
    // Never trust the client's price — re-read the package from YoActiv.
    // Only admin-enabled (visible) packages are purchasable.
    const [packages, prefs] = await Promise.all([
      fetchYoactivPackages(gym.yoactivBranchId),
      packagePrefs(target.branchId),
    ]);
    const rawPkg = packages.find(
      (p) =>
        p.id === body.packageId && !p.pt && isPackageVisible(p.id, prefs),
    );
    if (!rawPkg) {
      res.status(400).json({ error: "That package is no longer available" });
      return;
    }
    // Snapshot the curated display name so purchase history matches what
    // the member saw when buying; price always comes from live YoActiv data.
    const pkg = applyPackagePref(rawPkg, prefs);
    // Prefer the email typed into the purchase form; fall back to the
    // signed-in account's email so the gym system still gets one.
    let email: string | null = body.email?.trim() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Please enter a valid email address" });
      return;
    }
    if (!email && req.userId) {
      const [user] = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, req.userId));
      email = user?.email ?? null;
    }
    const memberId = await ensureYoactivMemberId(
      target,
      mobile,
      body.name.trim(),
      email,
    );
    if (!memberId) {
      res.status(502).json({
        error: "Could not register you with the gym system. Please try again.",
      });
      return;
    }

    // Refer & Earn: signed-in members may apply wallet points (1 point = ₹1)
    // as a discount. Clamp to their balance and keep at least ₹1 payable so
    // the hosted payment page always has a real charge. Points are debited at
    // the paid-flip (a pending purchase that never completes costs nothing).
    const listPrice = Math.round(pkg.amountInr);

    // Coupon first (validated against the list price), then wallet points on
    // the remainder. Both keep at least ₹1 payable.
    let couponId = 0;
    let couponCode = "";
    let couponDiscountInr = 0;
    if (typeof body.couponCode === "string" && body.couponCode.trim()) {
      const quote = await quoteCoupon({
        code: body.couponCode,
        amountInr: listPrice,
        kind: "package",
        userId: req.userId ?? null,
        mobile,
      });
      if (!quote.ok) {
        res.status(400).json({ error: quote.error ?? "Invalid coupon" });
        return;
      }
      couponId = quote.couponId!;
      couponCode = quote.code!;
      couponDiscountInr = quote.discountInr!;
    }
    const afterCoupon = listPrice - couponDiscountInr;

    let redeemInr = 0;
    if (req.userId && (body.redeemPoints ?? 0) > 0) {
      const balance = await walletBalance(req.userId);
      redeemInr = Math.min(
        Math.round(body.redeemPoints!),
        balance,
        Math.max(afterCoupon - 1, 0),
      );
      redeemInr = Math.max(redeemInr, 0);
    }
    const chargeInr = afterCoupon - redeemInr;

    const token = randomBytes(24).toString("hex");
    const [booking] = await db
      .insert(packageBookingsTable)
      .values({
        token,
        userId: req.userId ?? null,
        gymId: gym.id,
        gymName: gym.name,
        branchId: target.branchId,
        memberName: body.name.trim(),
        mobile,
        packageName: pkg.name,
        serviceName: pkg.serviceName,
        amountInr: chargeInr,
        redeemPointsInr: redeemInr,
        couponId,
        couponCode,
        couponDiscountInr,
        startDate: body.startDate,
        status: "pending",
      })
      .returning();

    const base = publicBaseUrl(req);
    const paymentUrl = await createYoactivPaymentUrl({
      target,
      memberId,
      variationId: pkg.id,
      amountInr: chargeInr,
      startDateIso: body.startDate,
      successUrl: `${base}/api/pay/package/${token}/success`,
      failedUrl: `${base}/api/pay/package/${token}/failed`,
    });
    if (!paymentUrl) {
      await db
        .update(packageBookingsTable)
        .set({ status: "failed" })
        .where(eq(packageBookingsTable.id, booking!.id));
      res.status(502).json({
        error: "Could not start the payment. Please try again.",
      });
      return;
    }
    res.json(
      CreatePackageBookingResponse.parse({
        id: booking!.id,
        status: "pending",
        amountInr: chargeInr,
        redeemedInr: redeemInr,
        paymentUrl,
        // Returned only here, to the purchase creator — lets a guest poll
        // their purchase status without an account.
        token,
      }),
    );
  },
);

function toApiBooking(row: typeof packageBookingsTable.$inferSelect) {
  return {
    id: row.id,
    status: row.status,
    amountInr: row.amountInr,
    packageName: row.packageName,
    serviceName: row.serviceName,
    gymName: row.gymName,
    startDate: row.startDate,
    createdAt: row.createdAt.toISOString(),
  };
}

// The caller's own purchases, newest first (shown on the app Profile).
router.get(
  "/package-bookings/mine",
  requireUser,
  async (req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(packageBookingsTable)
      .where(eq(packageBookingsTable.userId, req.userId!))
      .orderBy(desc(packageBookingsTable.createdAt))
      .limit(50);
    res.json(ListMyPackageBookingsResponse.parse(rows.map(toApiBooking)));
  },
);

// Status polling for whoever made the purchase: a signed-in member (owner
// check) or a guest presenting the purchase token they got at creation.
router.get(
  "/package-bookings/:bookingId",
  optionalUser,
  async (req: Request, res: Response): Promise<void> => {
    const params = GetPackageBookingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .select()
      .from(packageBookingsTable)
      .where(eq(packageBookingsTable.id, params.data.bookingId));
    if (!row) {
      res.status(404).json({ error: "Purchase not found" });
      return;
    }
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const isOwner = req.userId !== undefined && row.userId === req.userId;
    // Money path: validate format first, then compare in constant time.
    const hasToken =
      /^[0-9a-f]{48}$/.test(token) &&
      token.length === row.token.length &&
      timingSafeEqual(Buffer.from(token), Buffer.from(row.token));
    if (!isOwner && !hasToken) {
      res.status(404).json({ error: "Purchase not found" });
      return;
    }
    res.json(GetPackageBookingResponse.parse(toApiBooking(row)));
  },
);

// ─── Payment redirect landings (opened by YoActiv's hosted page) ────────────

function landingHtml(ok: boolean): string {
  const title = ok ? "Payment successful" : "Payment failed";
  const msg = ok
    ? "Your membership package is active. You can close this page and return to the Iconic Fitness app."
    : "The payment didn't go through. You can close this page, return to the app and try again.";
  const accent = ok ? "#C7F000" : "#ff6b6b";
  // Try to bounce straight back into the app via its deep-link scheme; keep a
  // visible button as the fallback (the auto-attempt is a no-op if the scheme
  // isn't handled, e.g. on desktop browsers).
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#0A0C08;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center">
<div style="padding:32px;max-width:360px"><div style="font-size:48px">${ok ? "✓" : "✕"}</div>
<h1 style="color:${accent};font-size:22px;margin:12px 0">${title}</h1>
<p style="color:#aaa;font-size:15px;line-height:1.5">${msg}</p>
<a href="iconic-app://" style="display:inline-block;margin-top:20px;padding:14px 28px;border-radius:999px;background:${accent};color:#0A0C08;font-weight:700;text-decoration:none">Back to the app</a></div>
<script>setTimeout(function(){window.location.href="iconic-app://";},600);</script></body></html>`;
}

router.get(
  "/pay/package/:token/:outcome",
  async (req: Request, res: Response): Promise<void> => {
    const token = String(req.params.token ?? "");
    const outcome = req.params.outcome === "success" ? "paid" : "failed";
    if (/^[0-9a-f]{48}$/.test(token)) {
      // Only move pending rows — a landing page reload can't flip a final state.
      const [flipped] = await db
        .update(packageBookingsTable)
        .set(
          outcome === "paid"
            ? { status: "paid", paidAt: new Date() }
            : { status: "failed" },
        )
        .where(
          and(
            eq(packageBookingsTable.token, token),
            eq(packageBookingsTable.status, "pending"),
          ),
        )
        .returning();
      // Refer & Earn side effects run exactly once, on the pending→paid flip:
      // settle the points the buyer applied, then credit their referrer (if
      // this was the referred member's first paid purchase).
      if (flipped && outcome === "paid") {
        // The plan changed upstream — bust the 5-min YoActiv lookup cache so
        // the member's next /memberships/mine sees the new plan immediately.
        invalidateYoactivMemberCache(flipped.mobile);
        if (flipped.userId && flipped.redeemPointsInr > 0) {
          await debitWallet({
            userId: flipped.userId,
            amountInr: flipped.redeemPointsInr,
            label: `Points redeemed — ${flipped.packageName}`,
            refType: "package_redeem",
            refId: String(flipped.id),
          });
        }
        if (flipped.couponId > 0 && flipped.couponDiscountInr > 0) {
          await recordCouponRedemption({
            couponId: flipped.couponId,
            code: flipped.couponCode,
            kind: "package",
            bookingId: flipped.id,
            discountInr: flipped.couponDiscountInr,
            userId: flipped.userId,
            mobile: flipped.mobile,
          });
        }
        await creditReferralRewardOnce(
          flipped.userId,
          flipped.amountInr + flipped.redeemPointsInr,
        );
      }
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(landingHtml(outcome === "paid"));
  },
);

export default router;
