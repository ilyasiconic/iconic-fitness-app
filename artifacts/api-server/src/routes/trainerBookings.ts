import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import {
  db,
  gymsTable,
  ptAttendanceTable,
  ptMembershipsTable,
  ptProgramsTable,
  ptTrialFeedbackTable,
  trainerBookingsTable,
  usersTable,
} from "@workspace/db";
import {
  ListTrainerPackagesQueryParams,
  ListTrainerPackagesResponse,
  CreateTrainerBookingBody,
  CreateTrainerBookingResponse,
  GetTrainerBookingParams,
  GetTrainerBookingResponse,
  ListMyTrainerBookingsResponse,
  GetMyPtProgramResponse,
  ListMyPtTrialFeedbackResponse,
  SubmitPtTrialFeedbackBody,
  SubmitPtTrialFeedbackResponse,
} from "@workspace/api-zod";
import { desc, sql } from "drizzle-orm";
import { leadsTable } from "@workspace/db";
import { TRAINER_ENQUIRY_SOURCE } from "../lib/trainerEnquiryLeads";
import { fetchPtAssignmentMap } from "../lib/ptAssignments";
import { trainerPhotoMap } from "../lib/trainerPhotos";
import { PT_TOTAL_SESSIONS, listPtSessions } from "../lib/ptSessions";
import { requireUser } from "../lib/currentUser";
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

// Purchasable packages (live prices) for a branch.
router.get("/trainer-packages", async (req, res): Promise<void> => {
  const parsed = ListTrainerPackagesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!yoactivConfigured()) {
    res.json(ListTrainerPackagesResponse.parse([]));
    return;
  }
  const [gym] = await db
    .select({
      yoactivBranchId: gymsTable.yoactivBranchId,
      yoactivPtBranchId: gymsTable.yoactivPtBranchId,
    })
    .from(gymsTable)
    .where(eq(gymsTable.id, parsed.data.gymId));
  // PT sales may run through a dedicated YoActiv branch; fall back to the
  // gym's main branch when no PT branch is mapped.
  const ptBranchId = gym?.yoactivPtBranchId ?? gym?.yoactivBranchId;
  // No branch mapping → no paid packages; the app falls back to enquiries.
  if (!ptBranchId) {
    res.json(ListTrainerPackagesResponse.parse([]));
    return;
  }
  const [packages, prefs] = await Promise.all([
    fetchYoactivPackages(ptBranchId),
    packagePrefs(ptBranchId),
  ]);
  res.json(
    ListTrainerPackagesResponse.parse(
      packages
        .filter((p) => isPackageVisible(p.id, prefs))
        .map((p) => applyPackagePref(p, prefs)),
    ),
  );
});

// Best-effort parse of a YoActiv duration label ("1 Month", "3 Months",
// "45 Days", "1 Year") into whole days; 30 when unrecognised.
function durationToDays(duration: string): number {
  const m = /(\d+)\s*(day|week|month|year)/i.exec(duration);
  if (!m) return 30;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const per =
    unit === "day" ? 1 : unit === "week" ? 7 : unit === "month" ? 30 : 365;
  return Math.max(1, n * per);
}

function istTodayStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
}

/** endDate = start + durationDays − 1 (matches the staff PT dashboard rule). */
function ptEndDate(startDate: string, durationDays: number): string {
  const t = Date.parse(`${startDate}T00:00:00Z`);
  return new Date(t + (durationDays - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

// Once a PT plan payment lands, enrol the member on the staff PT dashboard so
// the trainer can run monthly sessions immediately — no manual add needed.
// The trainer who ran the member's kick-starter owns the enrolment; when no
// kick-starter exists, the paid booking still shows up under PT requests for
// a trainer to accept. Idempotent via the booking_id partial unique index.
async function autoEnrolPtMembership(
  booking: typeof trainerBookingsTable.$inferSelect,
): Promise<void> {
  try {
    // Deterministic trainer match: an exact account match always wins; the
    // phone fallback (for userId-NULL rows) is scoped to the same gym so a
    // recycled/shared number can never pull in another member's trainer.
    const last10 = normalizeMobile(booking.mobile);
    let program: typeof ptProgramsTable.$inferSelect | undefined;
    if (booking.userId) {
      [program] = await db
        .select()
        .from(ptProgramsTable)
        .where(eq(ptProgramsTable.userId, booking.userId))
        .orderBy(desc(ptProgramsTable.acceptedAt))
        .limit(1);
    }
    if (!program && last10) {
      [program] = await db
        .select()
        .from(ptProgramsTable)
        .where(
          and(
            isNull(ptProgramsTable.userId),
            eq(ptProgramsTable.gymId, booking.gymId),
            sql`right(regexp_replace(${ptProgramsTable.memberPhone}, '\\D', '', 'g'), 10) = ${last10}`,
          ),
        )
        .orderBy(desc(ptProgramsTable.acceptedAt))
        .limit(1);
    }
    if (!program) return; // no kick-starter trainer — staff accepts manually
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(booking.preferredDate)
      ? booking.preferredDate
      : istTodayStr();
    const durationDays =
      booking.durationDays > 0 ? booking.durationDays : 30;
    await db
      .insert(ptMembershipsTable)
      .values({
        source: "yoactiv",
        bookingId: booking.id,
        staffId: program.staffId,
        staffName: program.staffName,
        memberName: booking.memberName,
        mobile: booking.mobile,
        gymId: booking.gymId,
        gymName: booking.gymName,
        packageName: booking.packageName,
        durationDays,
        originalSessions: booking.sessions > 0 ? booking.sessions : 12,
        amountPaidInr: booking.amountInr,
        paymentStatus: "paid",
        startDate,
        endDate: ptEndDate(startDate, durationDays),
        notes: "Auto-enrolled from in-app PT plan payment",
      })
      .onConflictDoNothing();
  } catch (err) {
    // Never break the payment landing page — staff can add the member by hand.
    console.error("PT auto-enrol failed", err);
  }
}

// The member's paid PT plan from the staff PT dashboard (pt_memberships):
// exact userId match via the originating booking wins; the phone fallback only
// covers manually-added rows. Newest paid row; attendance count = delivered.
async function fetchMyPtPlan(
  userId: number,
  last10: string,
): Promise<{
  packageName: string;
  gymName: string;
  trainerName: string;
  totalSessions: number;
  sessionsDelivered: number;
  startDate: string;
  endDate: string;
  expired: boolean;
} | null> {
  // Paid rows only; phone fallback is restricted to rows with NO originating
  // booking (manually-added by staff) so a recycled/shared number can never
  // surface a plan that belongs to a different account.
  const rows = await db
    .select({
      m: ptMembershipsTable,
      bookingUserId: trainerBookingsTable.userId,
    })
    .from(ptMembershipsTable)
    .leftJoin(
      trainerBookingsTable,
      eq(ptMembershipsTable.bookingId, trainerBookingsTable.id),
    )
    .where(
      and(
        eq(ptMembershipsTable.paymentStatus, "paid"),
        or(
          eq(trainerBookingsTable.userId, userId),
          last10
            ? and(
                isNull(ptMembershipsTable.bookingId),
                sql`right(regexp_replace(${ptMembershipsTable.mobile}, '\\D', '', 'g'), 10) = ${last10}`,
              )
            : sql`false`,
        ),
      ),
    )
    .orderBy(desc(ptMembershipsTable.createdAt));
  // Newest paid row, preferring an account-linked one over a phone match.
  const pick =
    rows.find((r) => r.bookingUserId === userId)?.m ?? rows[0]?.m;
  if (!pick) return null;
  const [att] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ptAttendanceTable)
    .where(eq(ptAttendanceTable.membershipId, pick.id));
  return {
    packageName: pick.packageName,
    gymName: pick.gymName,
    trainerName: pick.staffName,
    totalSessions: pick.originalSessions,
    sessionsDelivered: att?.count ?? 0,
    startDate: pick.startDate,
    endDate: pick.endDate,
    expired: istTodayStr() > pick.endDate,
  };
}

// Start a paid booking: verify the package server-side, register the member in
// the gym-management system if needed, create a pending booking row, and hand
// back YoActiv's hosted Razorpay payment link (valid ~5 minutes).
router.post(
  "/trainer-bookings",
  requireUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateTrainerBookingBody.safeParse(req.body);
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.preferredDate)) {
      res.status(400).json({ error: "Invalid preferred date" });
      return;
    }
    const [gym] = await db
      .select({
        id: gymsTable.id,
        name: gymsTable.name,
        yoactivBranchId: gymsTable.yoactivBranchId,
        yoactivPtBranchId: gymsTable.yoactivPtBranchId,
      })
      .from(gymsTable)
      .where(eq(gymsTable.id, body.gymId));
    if (!gym) {
      res.status(404).json({ error: "Branch not found" });
      return;
    }
    // PT purchases bill through the gym's dedicated PT-sales branch when one
    // is mapped, so the money lands in the right YoActiv account.
    const target = await resolveBranchTarget(
      gym.yoactivPtBranchId ?? gym.yoactivBranchId,
    );
    if (!target) {
      res.status(409).json({
        error: "Online payment isn't available for this branch yet",
      });
      return;
    }
    // Never trust the client's price — re-read the package from YoActiv.
    // Only admin-enabled (visible) packages are purchasable.
    const [packages, prefs] = await Promise.all([
      fetchYoactivPackages(target.branchId),
      packagePrefs(target.branchId),
    ]);
    // Only genuine PT packages are purchasable here (same classification as
    // the app's PT list) — blocks applying PT-only coupons to other packages.
    const rawPkg = packages.find(
      (p) =>
        p.id === body.packageId &&
        isPackageVisible(p.id, prefs) &&
        (p.pt ||
          /(\bpt\b|personal\s*train)/i.test(`${p.serviceName} ${p.name}`)),
    );
    if (!rawPkg) {
      res.status(400).json({ error: "That package is no longer available" });
      return;
    }
    // Snapshot the curated display name so purchase history matches what
    // the member saw when buying; price always comes from live YoActiv data.
    const pkg = applyPackagePref(rawPkg, prefs);
    const [user] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!));
    const memberId = await ensureYoactivMemberId(
      target,
      mobile,
      body.name.trim(),
      user?.email ?? null,
    );
    if (!memberId) {
      res.status(502).json({
        error: "Could not register you with the gym system. Please try again.",
      });
      return;
    }

    // Optional coupon — validated against the live list price.
    const listPrice = Math.round(pkg.amountInr);
    let couponId = 0;
    let couponCode = "";
    let couponDiscountInr = 0;
    if (typeof body.couponCode === "string" && body.couponCode.trim()) {
      const quote = await quoteCoupon({
        code: body.couponCode,
        amountInr: listPrice,
        kind: "pt",
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
    let chargeInr = listPrice - couponDiscountInr;

    // Optional wallet points redemption (coupon first, keep at least ₹1
    // payable — the hosted payment page needs a real charge). Points are
    // only quoted here; the actual debit settles at paid-flip (idempotent).
    let pointsRedeemedInr = 0;
    const requestedPoints = Math.floor(Number(body.redeemPoints ?? 0));
    if (requestedPoints > 0) {
      const balance = await walletBalance(req.userId!);
      pointsRedeemedInr = Math.min(
        requestedPoints,
        balance,
        Math.max(chargeInr - 1, 0),
      );
      chargeInr -= pointsRedeemedInr;
    }

    const token = randomBytes(24).toString("hex");
    const [booking] = await db
      .insert(trainerBookingsTable)
      .values({
        token,
        userId: req.userId!,
        gymId: gym.id,
        gymName: gym.name,
        branchId: target.branchId,
        trainerId: body.trainerId ?? "",
        trainerName: body.trainerName ?? "",
        memberName: body.name.trim(),
        mobile,
        packageName: pkg.name,
        serviceName: pkg.serviceName,
        amountInr: chargeInr,
        couponId,
        couponCode,
        couponDiscountInr,
        pointsRedeemedInr,
        // Snapshot for the staff PT dashboard auto-enrol once payment lands.
        sessions: pkg.sessions ?? 0,
        durationDays: durationToDays(pkg.duration),
        preferredDate: body.preferredDate,
        status: "pending",
      })
      .returning();

    const base = publicBaseUrl(req);
    const paymentUrl = await createYoactivPaymentUrl({
      target,
      memberId,
      variationId: pkg.id,
      amountInr: chargeInr,
      startDateIso: body.preferredDate,
      successUrl: `${base}/api/pay/trainer/${token}/success`,
      failedUrl: `${base}/api/pay/trainer/${token}/failed`,
    });
    if (!paymentUrl) {
      await db
        .update(trainerBookingsTable)
        .set({ status: "failed" })
        .where(eq(trainerBookingsTable.id, booking!.id));
      res.status(502).json({
        error: "Could not start the payment. Please try again.",
      });
      return;
    }
    res.json(
      CreateTrainerBookingResponse.parse({
        id: booking!.id,
        status: "pending",
        amountInr: chargeInr,
        paymentUrl,
      }),
    );
  },
);

// The caller's PT bookings (paid/pending/failed rows) merged with their free
// session-request enquiries (leads matched by the account's mobile number).
// Registered BEFORE /:bookingId so "mine" never hits the param route.
router.get(
  "/trainer-bookings/mine",
  requireUser,
  async (req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(trainerBookingsTable)
      .where(
        and(
          eq(trainerBookingsTable.userId, req.userId!),
          // Staff-cancelled bookings drop out so the member can book again.
          ne(trainerBookingsTable.status, "cancelled"),
        ),
      )
      .orderBy(desc(trainerBookingsTable.createdAt));

    const out = rows.map((row) => ({
      id: row.id,
      status: row.status,
      amountInr: row.amountInr,
      packageName: row.packageName,
      trainerName: row.trainerName,
      gymName: row.gymName,
      preferredDate: row.preferredDate,
      createdAt: row.createdAt.toISOString(),
    }));

    // Session-request enquiries are leads keyed by phone, not user id — match
    // them via the account's mobile so "already requested a PT" is visible.
    const [user] = await db
      .select({ mobile: usersTable.mobile })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!));
    const mobile = normalizeMobile(user?.mobile ?? "");
    if (mobile) {
      // Match in SQL on the normalized (last-10-digits) phone so every
      // enquiry the member ever sent is found, regardless of formatting.
      const leads = await db
        .select({
          id: leadsTable.id,
          trainerName: leadsTable.className,
          gymName: leadsTable.gymName,
          phone: leadsTable.phone,
          preferredDate: leadsTable.preferredDate,
          createdAt: leadsTable.createdAt,
        })
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.source, TRAINER_ENQUIRY_SOURCE),
            eq(leadsTable.kind, "general"),
            // Staff-cancelled requests drop out so the member can book again.
            ne(leadsTable.status, "cancelled"),
            sql`right(regexp_replace(${leadsTable.phone}, '\\D', '', 'g'), 10) = ${mobile}`,
          ),
        )
        .orderBy(desc(leadsTable.createdAt));
      for (const l of leads) {
        out.push({
          id: -l.id,
          status: "enquiry",
          amountInr: 0,
          packageName: "Session request",
          trainerName: l.trainerName,
          gymName: l.gymName,
          preferredDate: l.preferredDate,
          createdAt: l.createdAt.toISOString(),
        });
      }
    }

    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(ListMyTrainerBookingsResponse.parse(out));
  },
);

// The caller's active PT program: their newest PT enrolment (paid booking or
// enquiry lead) that has a staff-assigned trainer, plus the scheduled session
// timings. `active:false` when nothing is assigned yet.
router.get(
  "/pt/mine",
  requireUser,
  async (req: Request, res: Response): Promise<void> => {
    const empty = {
      active: false,
      kickstarterCompleted: false,
      hasPaidPlan: false,
      gymId: null,
      plan: null,
      trainerName: "",
      gymName: "",
      packageName: "",
      totalSessions: PT_TOTAL_SESSIONS,
      completedCount: 0,
      sessions: [],
    };

    // Candidate enrolments, newest first: paid bookings by user id, then
    // enquiry leads matched via the account's normalized mobile.
    const bookings = await db
      .select({
        id: trainerBookingsTable.id,
        gymId: trainerBookingsTable.gymId,
        gymName: trainerBookingsTable.gymName,
        packageName: trainerBookingsTable.packageName,
        createdAt: trainerBookingsTable.createdAt,
      })
      .from(trainerBookingsTable)
      .where(
        and(
          eq(trainerBookingsTable.userId, req.userId!),
          eq(trainerBookingsTable.status, "paid"),
        ),
      )
      .orderBy(desc(trainerBookingsTable.createdAt));

    const [user] = await db
      .select({ mobile: usersTable.mobile })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!));
    const mobile = normalizeMobile(user?.mobile ?? "");
    const enquiries = mobile
      ? await db
          .select({
            id: leadsTable.id,
            gymId: leadsTable.gymId,
            gymName: leadsTable.gymName,
            createdAt: leadsTable.createdAt,
            preferredDate: leadsTable.preferredDate,
            preferredTime: leadsTable.preferredTime,
          })
          .from(leadsTable)
          .where(
            and(
              eq(leadsTable.source, TRAINER_ENQUIRY_SOURCE),
              eq(leadsTable.kind, "general"),
              // Staff-cancelled requests must not count as an active PT program.
              ne(leadsTable.status, "cancelled"),
              sql`right(regexp_replace(${leadsTable.phone}, '\\D', '', 'g'), 10) = ${mobile}`,
            ),
          )
          .orderBy(desc(leadsTable.createdAt))
      : [];

    const [bookingAssign, enquiryAssign] = await Promise.all([
      fetchPtAssignmentMap(
        "booking",
        bookings.map((b) => b.id),
      ),
      fetchPtAssignmentMap(
        "enquiry",
        enquiries.map((l) => l.id),
      ),
    ]);

    // Trainer acceptances from the staff workspace (pt_programs) also count
    // as an assigned trainer — the member shouldn't wait for a separate
    // partner-admin assignment to see who accepted their kick-starter trial.
    const programRefs = [
      ...bookings.map((b) => ({ refType: "booking" as const, refId: b.id })),
      ...enquiries.map((l) => ({ refType: "enquiry" as const, refId: l.id })),
    ];
    const programRows = programRefs.length
      ? await db
          .select()
          .from(ptProgramsTable)
          .where(
            or(
              ...programRefs.map((r) =>
                and(
                  eq(ptProgramsTable.refType, r.refType),
                  eq(ptProgramsTable.refId, r.refId),
                ),
              ),
            ),
          )
      : [];
    const programByRef = new Map(
      programRows.map((p) => [`${p.refType}:${p.refId}`, p]),
    );

    type Candidate = {
      refType: "booking" | "enquiry";
      refId: number;
      trainerId: string;
      trainerName: string;
      gymId: number | null;
      gymName: string;
      packageName: string;
      createdAt: Date;
    };
    const candidates: Candidate[] = [
      ...bookings
        .filter(
          (b) => bookingAssign.has(b.id) || programByRef.has(`booking:${b.id}`),
        )
        .map((b) => ({
          refType: "booking" as const,
          refId: b.id,
          // Partner assignment wins (it carries the roster photo); a staff
          // acceptance fills in when no assignment exists yet.
          trainerId: bookingAssign.get(b.id)?.trainerId ?? "",
          trainerName:
            bookingAssign.get(b.id)?.trainerName ??
            programByRef.get(`booking:${b.id}`)!.staffName,
          gymId: b.gymId,
          gymName: b.gymName,
          packageName: b.packageName,
          createdAt: b.createdAt,
        })),
      ...enquiries
        .filter(
          (l) => enquiryAssign.has(l.id) || programByRef.has(`enquiry:${l.id}`),
        )
        .map((l) => ({
          refType: "enquiry" as const,
          refId: l.id,
          trainerId: enquiryAssign.get(l.id)?.trainerId ?? "",
          trainerName:
            enquiryAssign.get(l.id)?.trainerName ??
            programByRef.get(`enquiry:${l.id}`)!.staffName,
          gymId: l.gymId ?? null,
          gymName: l.gymName ?? "",
          packageName: "Personal training",
          createdAt: l.createdAt,
        })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Paid plan from the staff PT dashboard — the member's monthly sessions
    // start only once this exists (i.e. after the plan payment landed).
    const plan = await fetchMyPtPlan(req.userId!, mobile ?? "");

    const current = candidates[0];
    if (!current) {
      if (plan) {
        res.json(
          GetMyPtProgramResponse.parse({
            ...empty,
            active: true,
            hasPaidPlan: true,
            plan,
            trainerName: plan.trainerName,
            gymName: plan.gymName,
            packageName: plan.packageName,
            totalSessions: plan.totalSessions,
          }),
        );
        return;
      }
      res.json(GetMyPtProgramResponse.parse(empty));
      return;
    }
    const sessions = await listPtSessions(current.refType, current.refId);
    const program = programByRef.get(`${current.refType}:${current.refId}`);
    // Kick-starter trials often have no partner-scheduled sessions — show the
    // requested slot and the trainer's done-stamps so the member still sees
    // their timing and progress.
    if (sessions.length === 0 && program) {
      const lead = enquiries.find(
        (l) => current.refType === "enquiry" && l.id === current.refId,
      );
      const istDay = (d: Date): string =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
        }).format(d);
      const fallbackDate = lead?.preferredDate ?? "";
      const fallbackTime = lead?.preferredTime ?? "";
      const stamps = [program.session1DoneAt, program.session2DoneAt];
      for (let n = 0; n < 2; n++) {
        const doneAt = stamps[n];
        const date = doneAt ? istDay(doneAt) : fallbackDate;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        sessions.push({
          id: -(n + 1),
          date,
          time: /^([01]\d|2[0-3]):[0-5]\d$/.test(fallbackTime)
            ? fallbackTime
            : "07:00",
          status: doneAt ? "completed" : "scheduled",
        });
      }
    }
    const doneStamps = program
      ? [program.session1DoneAt, program.session2DoneAt].filter(Boolean).length
      : 0;
    // Staff-uploaded photo of the assigned trainer (shown on the member Home).
    const photos = current.trainerId
      ? await trainerPhotoMap([current.trainerId])
      : new Map<string, string>();
    res.json(
      GetMyPtProgramResponse.parse({
        active: true,
        // "Book your PT plan" CTA: the free kick-starter is done and the
        // member hasn't bought a paid plan yet.
        kickstarterCompleted: program?.status === "completed",
        hasPaidPlan: bookings.length > 0 || plan !== null,
        gymId: current.gymId,
        plan,
        trainerName: plan?.trainerName || current.trainerName,
        trainerPhotoUrl: photos.get(current.trainerId) ?? "",
        gymName: current.gymName,
        packageName: current.packageName,
        totalSessions: PT_TOTAL_SESSIONS,
        completedCount: Math.max(
          sessions.filter((s) => s.status === "completed").length,
          doneStamps,
        ),
        sessions,
      }),
    );
  },
);

// ─── Kick-starter trial session feedback (Home "fitness journey") ───────────

// The caller's feedback rows for the two trial sessions (1 and 2).
router.get(
  "/pt/trial-feedback/mine",
  requireUser,
  async (req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select({
        sessionNo: ptTrialFeedbackTable.sessionNo,
        rating: ptTrialFeedbackTable.rating,
        comment: ptTrialFeedbackTable.comment,
      })
      .from(ptTrialFeedbackTable)
      .where(eq(ptTrialFeedbackTable.userId, req.userId!))
      .orderBy(ptTrialFeedbackTable.sessionNo);
    res.json(ListMyPtTrialFeedbackResponse.parse(rows));
  },
);

// Submit (or update) feedback for a trial session — upserted per user+session.
router.post(
  "/pt/trial-feedback",
  requireUser,
  async (req: Request, res: Response): Promise<void> => {
    const body = SubmitPtTrialFeedbackBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const { sessionNo, rating } = body.data;
    const comment = body.data.comment ?? "";
    const [row] = await db
      .insert(ptTrialFeedbackTable)
      .values({ userId: req.userId!, sessionNo, rating, comment })
      .onConflictDoUpdate({
        target: [ptTrialFeedbackTable.userId, ptTrialFeedbackTable.sessionNo],
        set: { rating, comment },
      })
      .returning();
    res.json(
      SubmitPtTrialFeedbackResponse.parse({
        sessionNo: row!.sessionNo,
        rating: row!.rating,
        comment: row!.comment,
      }),
    );
  },
);

// Status polling for the member who made the booking.
router.get(
  "/trainer-bookings/:bookingId",
  requireUser,
  async (req: Request, res: Response): Promise<void> => {
    const params = GetTrainerBookingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .select()
      .from(trainerBookingsTable)
      .where(
        and(
          eq(trainerBookingsTable.id, params.data.bookingId),
          eq(trainerBookingsTable.userId, req.userId!),
        ),
      );
    if (!row) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    res.json(
      GetTrainerBookingResponse.parse({
        id: row.id,
        status: row.status,
        amountInr: row.amountInr,
        packageName: row.packageName,
        trainerName: row.trainerName,
        gymName: row.gymName,
        preferredDate: row.preferredDate,
        createdAt: row.createdAt.toISOString(),
      }),
    );
  },
);

// ─── Payment redirect landings (opened by YoActiv's hosted page) ────────────

function landingHtml(ok: boolean): string {
  const title = ok ? "Payment successful" : "Payment failed";
  const msg = ok
    ? "Your trainer session is booked. You can close this page and return to the Iconic Fitness app."
    : "The payment didn't go through. You can close this page, return to the app and try again.";
  const accent = ok ? "#C7F000" : "#ff6b6b";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#0A0C08;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center">
<div style="padding:32px;max-width:360px"><div style="font-size:48px">${ok ? "✓" : "✕"}</div>
<h1 style="color:${accent};font-size:22px;margin:12px 0">${title}</h1>
<p style="color:#aaa;font-size:15px;line-height:1.5">${msg}</p>
<a href="iconic-app://" style="display:inline-block;margin-top:20px;padding:14px 28px;border-radius:999px;background:${accent};color:#0A0C08;font-weight:700;text-decoration:none">Back to the app</a></div>
<script>setTimeout(function(){window.location.href="iconic-app://";},600);</script></body></html>`;
}

router.get(
  "/pay/trainer/:token/:outcome",
  async (req: Request, res: Response): Promise<void> => {
    const token = String(req.params.token ?? "");
    const outcome = req.params.outcome === "success" ? "paid" : "failed";
    if (/^[0-9a-f]{48}$/.test(token)) {
      // Only move pending rows — a landing page reload can't flip a final state.
      const [flipped] = await db
        .update(trainerBookingsTable)
        .set(
          outcome === "paid"
            ? { status: "paid", paidAt: new Date() }
            : { status: "failed" },
        )
        .where(
          and(
            eq(trainerBookingsTable.token, token),
            eq(trainerBookingsTable.status, "pending"),
          ),
        )
        .returning();
      // Refer & Earn: a paid PT purchase also counts as the referred member's
      // first purchase (credited once per referred user, idempotent).
      if (flipped && outcome === "paid") {
        if (flipped.couponId > 0 && flipped.couponDiscountInr > 0) {
          await recordCouponRedemption({
            couponId: flipped.couponId,
            code: flipped.couponCode,
            kind: "pt",
            bookingId: flipped.id,
            discountInr: flipped.couponDiscountInr,
            userId: flipped.userId,
            mobile: flipped.mobile,
          });
        }
        // Settle the wallet points quoted at booking time (idempotent via
        // the (refType, refId) unique index — a landing reload can't double
        // debit; debit clamps to the current balance).
        if (flipped.pointsRedeemedInr > 0 && (flipped.userId ?? 0) > 0) {
          try {
            await debitWallet({
              userId: flipped.userId!,
              amountInr: flipped.pointsRedeemedInr,
              label: `PT plan #${flipped.id} — points redeemed`,
              refType: "pt_redeem",
              refId: String(flipped.id),
            });
          } catch (err) {
            console.error("[pt] points settlement failed:", err);
          }
        }
        // Reward is based on what the member actually spent in value terms
        // (paid amount + redeemed points).
        await creditReferralRewardOnce(
          flipped.userId,
          flipped.amountInr + (flipped.pointsRedeemedInr ?? 0),
        );
        await autoEnrolPtMembership(flipped);
      }
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(landingHtml(outcome === "paid"));
  },
);

export default router;
