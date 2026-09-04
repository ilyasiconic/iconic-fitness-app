import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const usersTable = pgTable(
  "users",
  {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").unique(),
  username: text("username"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  mobile: text("mobile").notNull(),
  gender: text("gender").notNull(),
  age: integer("age").notNull(),
  heightCm: real("height_cm").notNull(),
  weightKg: real("weight_kg").notNull(),
  fitnessGoal: text("fitness_goal").notNull(),
  avatarUrl: text("avatar_url").notNull(),
  city: text("city").notNull(),
  dailyCalories: integer("daily_calories").notNull().default(0),
  dailyWaterMl: integer("daily_water_ml").notNull().default(0),
  dailySleepHours: real("daily_sleep_hours").notNull().default(0),
  restingHr: integer("resting_hr").notNull().default(60),
  streakDays: integer("streak_days").notNull().default(0),
  weeklyGoal: integer("weekly_goal").notNull().default(5),
  waterGoalMl: integer("water_goal_ml").notNull().default(3000),
  calorieGoal: integer("calorie_goal").notNull().default(2200),
  proteinGoalG: integer("protein_goal_g").notNull().default(120),
  stepGoal: integer("step_goal").notNull().default(8000),
  experienceLevel: text("experience_level"),
  targetWeightKg: real("target_weight_kg"),
  activityLevel: text("activity_level"),
  foodPreference: text("food_preference"),
  assessment: jsonb("assessment"),
  assessmentCompletedAt: timestamp("assessment_completed_at", {
    withTimezone: true,
  }),
  memberCode: text("member_code").notNull(),
  // Refer & Earn: this member's own shareable code (lazily generated) and the
  // id of the member whose code they applied (0 = not referred).
  referralCode: text("referral_code"),
  referredBy: integer("referred_by").notNull().default(0),
  joinedAt: timestamp("joined_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Set to true once the WhatsApp/SMS member welcome message has been sent, so
  // we never send a duplicate even if they save their phone number again.
  welcomeSmsSent: boolean("welcome_sms_sent").notNull().default(false),
  },
  (t) => [
    uniqueIndex("users_username_lower_unique")
      .on(sql`lower(${t.username})`)
      .where(sql`${t.username} IS NOT NULL AND ${t.username} <> ''`),
    uniqueIndex("users_referral_code_unique")
      .on(t.referralCode)
      .where(sql`referral_code IS NOT NULL AND referral_code <> ''`),
  ],
);

// WhatsApp / SMS messaging config (single row, lazily created on first save).
// Twilio credentials are stored here; both SMS and WhatsApp channels are
// optional — the admin enables whichever they have provisioned.
export const messagingConfigTable = pgTable("messaging_config", {
  id: serial("id").primaryKey(),
  twilioAccountSid: text("twilio_account_sid").notNull().default(""),
  twilioAuthToken: text("twilio_auth_token").notNull().default(""),
  smsFrom: text("sms_from").notNull().default(""),
  whatsappFrom: text("whatsapp_from").notNull().default(""),
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
  leadWelcomeTemplate: text("lead_welcome_template")
    .notNull()
    .default(
      "Hi {{name}}! 👋 Thanks for your interest in GYMCO{{gymInfo}}. Our team will reach out shortly to schedule your visit. 💪",
    ),
  memberWelcomeTemplate: text("member_welcome_template")
    .notNull()
    .default(
      "Welcome to GYMCO, {{name}}! 🎉 Your fitness journey starts now. We'll be in touch to schedule your complimentary fitness assessment.",
    ),
  // Automated follow-up nudge for leads that go cold after the welcome.
  nudgeEnabled: boolean("nudge_enabled").notNull().default(false),
  nudgeDelayHours: integer("nudge_delay_hours").notNull().default(24),
  leadNudgeTemplate: text("lead_nudge_template")
    .notNull()
    .default(
      "Hi {{name}}! 👋 Just checking in — we'd love to help you get started{{gymInfo}}. Reply here or drop by any time for a free tour. 💪",
    ),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Outbound message delivery log — one row per message sent (or attempted).
// leadId and userId are both optional so the table covers both lead welcome
// messages and member welcome messages from a single log.
export const leadMessagesTable = pgTable("lead_messages", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id"),
  userId: integer("user_id"),
  toNumber: text("to_number").notNull(),
  body: text("body").notNull(),
  channel: text("channel").notNull().default("sms"), // 'sms' | 'whatsapp'
  messageType: text("message_type").notNull().default("welcome"), // 'welcome'|'nudge'|'manual'
  status: text("status").notNull().default("queued"), // 'queued'|'sent'|'failed'
  twilioSid: text("twilio_sid"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Refer & Earn admin configuration (single row, lazily created on first save).
// rewardType 'fixed' → rewardValue is ₹ credited per successful referral;
// rewardType 'percent' → rewardValue is % of the referred member's first paid
// purchase. Points are rupee-valued (1 point = ₹1) and live in wallets.
export const referralSettingsTable = pgTable("referral_settings", {
  id: serial("id").primaryKey(),
  rewardType: text("reward_type").notNull().default("fixed"), // fixed | percent
  rewardValue: integer("reward_value").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Small app-wide key/value settings (e.g. custom notification sound URLs).
// Keys are dot-namespaced strings like "notificationSound.members".
export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const gymsTable = pgTable("gyms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  city: text("city").notNull(),
  area: text("area").notNull(),
  address: text("address").notNull(),
  heroImage: text("hero_image").notNull(),
  videoUrl: text("video_url"),
  logoUrl: text("logo_url").notNull().default(""),
  rating: real("rating").notNull(),
  reviewsCount: integer("reviews_count").notNull(),
  priceFrom: integer("price_from").notNull(),
  categories: text("categories").array().notNull().default([]),
  amenities: text("amenities").array().notNull().default([]),
  distanceKm: real("distance_km").notNull(),
  isPremium: boolean("is_premium").notNull().default(false),
  openNow: boolean("open_now").notNull().default(true),
  about: text("about").notNull(),
  gallery: text("gallery").array().notNull().default([]),
  hours: text("hours").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  featured: boolean("featured").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(false),
  ownerPartnerId: integer("owner_partner_id"),
  payoutPerVisitInr: integer("payout_per_visit_inr").notNull().default(0),
  payoutTaxPct: integer("payout_tax_pct").notNull().default(18),
  // Maps this branch to its YoActiv Branch_Id so branch-scoped trainer
  // rosters and PT-package pricing can be pulled from the right branch.
  yoactivBranchId: integer("yoactiv_branch_id"),
  // Some gyms bill personal training through a separate dedicated YoActiv
  // "PT Sales" branch. When set, PT packages and PT payments use this branch;
  // memberships keep using yoactivBranchId.
  yoactivPtBranchId: integer("yoactiv_pt_branch_id"),
});

// Paid personal-training session bookings made from the mobile app.
// Payment runs through YoActiv's hosted Razorpay page (Billing/APIPayment);
// status moves pending → paid/failed via the redirect landing routes.
export const trainerBookingsTable = pgTable("trainer_bookings", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: integer("user_id"),
  gymId: integer("gym_id").notNull(),
  gymName: text("gym_name").notNull().default(""),
  branchId: integer("branch_id").notNull().default(0),
  trainerId: text("trainer_id").notNull().default(""),
  trainerName: text("trainer_name").notNull().default(""),
  memberName: text("member_name").notNull().default(""),
  mobile: text("mobile").notNull().default(""),
  packageName: text("package_name").notNull().default(""),
  serviceName: text("service_name").notNull().default(""),
  amountInr: integer("amount_inr").notNull().default(0),
  // Coupon applied to this purchase (₹ discount already subtracted from
  // amountInr). couponId is an immutable snapshot — redemption at paid-flip
  // settles against the id, so renaming/deleting the coupon can't detach it.
  couponId: integer("coupon_id").notNull().default(0),
  couponCode: text("coupon_code").notNull().default(""),
  couponDiscountInr: integer("coupon_discount_inr").notNull().default(0),
  // Wallet points (₹) applied at booking time; debited at paid-flip.
  pointsRedeemedInr: integer("points_redeemed_inr").notNull().default(0),
  // Package snapshot for the staff PT dashboard auto-enrol on payment.
  sessions: integer("sessions").notNull().default(0),
  durationDays: integer("duration_days").notNull().default(0),
  preferredDate: text("preferred_date").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending | paid | failed
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

// Staff-assigned trainer for a PT enrolment. One row per booking/enquiry
// (refType "booking" = trainer_bookings.id, "enquiry" = leads.id), upserted
// on reassignment. Display-only — no cross-table FKs (repo convention).
export const ptTrainerAssignmentsTable = pgTable(
  "pt_trainer_assignments",
  {
    id: serial("id").primaryKey(),
    refType: text("ref_type").notNull(), // booking | enquiry
    refId: integer("ref_id").notNull(),
    trainerId: text("trainer_id").notNull().default(""), // YoActiv staff id, "" if free-text
    trainerName: text("trainer_name").notNull().default(""),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("pt_assign_ref_unique").on(t.refType, t.refId)],
);

// Trainer-accepted PT programs (trainer workspace in the mobile app's studio
// side). One row per accepted request — the unique (ref_type, ref_id) index
// is the "first trainer to accept wins" truth. Status: accepted → ongoing
// (training started; unlocks the 2 free kick-starter sessions) → completed.
export const ptProgramsTable = pgTable(
  "pt_programs",
  {
    id: serial("id").primaryKey(),
    refType: text("ref_type").notNull(), // booking | enquiry
    refId: integer("ref_id").notNull(),
    staffId: integer("staff_id").notNull(), // accepting trainer (staff table)
    staffName: text("staff_name").notNull().default(""),
    memberName: text("member_name").notNull().default(""),
    memberPhone: text("member_phone").notNull().default(""),
    userId: integer("user_id"), // app user when known
    gymId: integer("gym_id"),
    gymName: text("gym_name").notNull().default(""),
    status: text("status").notNull().default("accepted"), // accepted | ongoing | completed
    session1DoneAt: timestamp("session1_done_at", { withTimezone: true }),
    session2DoneAt: timestamp("session2_done_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("pt_programs_ref_unique").on(t.refType, t.refId)],
);

// BMI records a trainer logs for a member (linked to a pt_program). Members
// see their own records in the app (matched by user_id or phone).
export const memberBmiRecordsTable = pgTable("member_bmi_records", {
  id: serial("id").primaryKey(),
  programId: integer("program_id"),
  staffId: integer("staff_id").notNull(),
  staffName: text("staff_name").notNull().default(""),
  memberPhone: text("member_phone").notNull().default(""),
  userId: integer("user_id"),
  heightCm: real("height_cm"),
  weightKg: real("weight_kg"),
  bmi: real("bmi"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// General Member Engagement: 45-day workout program auto-started for members
// who finished the kick-starter trial without buying PT (plan content lives in
// code — lib/engagementPlan.ts — keyed by level; only the enrolment is a row).
// last_followup_day / last_pt_reminder_day are lazy-milestone cursors.
export const memberEngagementProgramsTable = pgTable(
  "member_engagement_programs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    memberPhone: text("member_phone").notNull().default(""),
    level: text("level").notNull().default("beginner"), // beginner | intermediate | advanced
    startDate: text("start_date").notNull(), // YYYY-MM-DD (IST)
    gymId: integer("gym_id"),
    gymName: text("gym_name").notNull().default(""),
    assignedByStaffId: integer("assigned_by_staff_id"),
    assignedByStaffName: text("assigned_by_staff_name").notNull().default(""),
    dieticianName: text("dietician_name").notNull().default("In-house dietician"),
    status: text("status").notNull().default("active"), // active | completed
    lastFollowupDay: integer("last_followup_day").notNull().default(0),
    lastPtReminderDay: integer("last_pt_reminder_day").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("member_engagement_programs_user_unique").on(t.userId),
  ],
);

// Early-morning empty-stomach fitness assessment bookings (Member Success
// Journey: BMI + measurements before breakfast). Members book a slot after
// trial acceptance; staff/admin record results as a member_bmi_records row
// (bmiRecordId links back). reminder_sent_at guards the lazy evening-before
// reminder notification. One active ("booked") row per member.
export const assessmentBookingsTable = pgTable(
  "assessment_bookings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    memberName: text("member_name").notNull().default(""),
    memberPhone: text("member_phone").notNull().default(""),
    gymId: integer("gym_id"),
    gymName: text("gym_name").notNull().default(""),
    slotDate: text("slot_date").notNull(), // YYYY-MM-DD (IST)
    slotTime: text("slot_time").notNull(), // HH:MM 24h (IST), early morning
    status: text("status").notNull().default("booked"), // booked | completed | cancelled
    bmiRecordId: integer("bmi_record_id"),
    recordedByStaffId: integer("recorded_by_staff_id"),
    recordedByStaffName: text("recorded_by_staff_name").notNull().default(""),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("assessment_bookings_active_user_unique")
      .on(t.userId)
      .where(sql`status = 'booked'`),
  ],
);

// Diet plans a trainer writes for a member (linked to a pt_program).
export const memberDietPlansTable = pgTable("member_diet_plans", {
  id: serial("id").primaryKey(),
  programId: integer("program_id"),
  staffId: integer("staff_id").notNull(),
  staffName: text("staff_name").notNull().default(""),
  memberPhone: text("member_phone").notNull().default(""),
  userId: integer("user_id"),
  title: text("title").notNull().default(""),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Exercises a trainer assigns to a PT member. exerciseSlug references the
// app's bundled exercise library (lib/exercises.ts); name is snapshotted so
// history survives library edits. Prescription overrides are free text.
export const memberAssignedExercisesTable = pgTable("member_assigned_exercises", {
  id: serial("id").primaryKey(),
  programId: integer("program_id"),
  staffId: integer("staff_id").notNull(),
  staffName: text("staff_name").notNull().default(""),
  memberPhone: text("member_phone").notNull().default(""),
  userId: integer("user_id"),
  exerciseSlug: text("exercise_slug").notNull(),
  exerciseName: text("exercise_name").notNull().default(""),
  sets: text("sets").notNull().default(""),
  reps: text("reps").notNull().default(""),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// PT memberships (trainer dashboard roster). Rows come from manual trainer
// entry, optionally prefilled from the YoActiv member list. Session
// deduction is computed from elapsed days (originalSessions/durationDays
// per day, zero after endDate); delivered sessions come from pt_attendance.
// Member-raised complaint tickets, visible to admins (all) and to the branch
// partner owning the gym the complaint is about.
export const complaintsTable = pgTable("complaints", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  memberName: text("member_name").notNull().default(""),
  mobile: text("mobile").notNull().default(""),
  gymId: integer("gym_id"),
  gymName: text("gym_name").notNull().default(""),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"), // open | in_progress | resolved
  response: text("response").notNull().default(""),
  // Member follow-up thread: [{ message, reopened, at }] — lets a member reply
  // back or reopen a resolved ticket without raising a brand-new complaint.
  followUps: jsonb("follow_ups")
    .$type<Array<{ message: string; reopened: boolean; at: string }>>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ptMembershipsTable = pgTable("pt_memberships", {
  id: serial("id").primaryKey(),
  source: text("source").notNull().default("manual"), // manual | yoactiv
  // Set when the row was auto-created from a paid in-app PT booking
  // (trainer_bookings.id); partial unique index keeps the auto-enrol idempotent.
  bookingId: integer("booking_id"),
  staffId: integer("staff_id").notNull(), // owning trainer
  staffName: text("staff_name").notNull().default(""),
  memberName: text("member_name").notNull().default(""),
  membershipId: text("membership_id").notNull().default(""),
  mobile: text("mobile").notNull().default(""),
  gymId: integer("gym_id"),
  gymName: text("gym_name").notNull().default(""),
  packageName: text("package_name").notNull().default(""),
  durationDays: integer("duration_days").notNull().default(30),
  originalSessions: integer("original_sessions").notNull().default(12),
  amountPaidInr: integer("amount_paid_inr").notNull().default(0),
  paymentStatus: text("payment_status").notNull().default("paid"), // paid | pending
  startDate: text("start_date").notNull(), // YYYY-MM-DD (IST)
  endDate: text("end_date").notNull(), // YYYY-MM-DD (IST)
  renewalStatus: text("renewal_status").notNull().default("pending"), // pending | renewed | lost
  followUpDate: text("follow_up_date").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One row per delivered PT session (attendance). Unique per membership+day.
export const ptAttendanceTable = pgTable(
  "pt_attendance",
  {
    id: serial("id").primaryKey(),
    membershipId: integer("membership_id").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD (IST)
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("pt_attendance_unique").on(t.membershipId, t.date)],
);

// Admin-set monthly sales target per trainer.
export const trainerTargetsTable = pgTable(
  "trainer_targets",
  {
    id: serial("id").primaryKey(),
    staffId: integer("staff_id").notNull(),
    month: text("month").notNull(), // YYYY-MM
    targetInr: integer("target_inr").notNull().default(0),
  },
  (t) => [uniqueIndex("trainer_targets_unique").on(t.staffId, t.month)],
);

// Per-trainer monthly incentive adjustments + approval (manager screen).
export const trainerIncentivesTable = pgTable(
  "trainer_incentives",
  {
    id: serial("id").primaryKey(),
    staffId: integer("staff_id").notNull(),
    month: text("month").notNull(), // YYYY-MM
    adjustmentsInr: integer("adjustments_inr").notNull().default(0),
    approvalStatus: text("approval_status").notNull().default("pending"), // pending | approved
    note: text("note").notNull().default(""),
  },
  (t) => [uniqueIndex("trainer_incentives_unique").on(t.staffId, t.month)],
);

// Staff-scheduled PT session timings for a PT enrolment (same refType/refId
// keying as pt_trainer_assignments). Members see these on the PT Details
// screen; staff manage them from the PT Bookings dashboards.
export const ptSessionsTable = pgTable("pt_sessions", {
  id: serial("id").primaryKey(),
  refType: text("ref_type").notNull(), // booking | enquiry
  refId: integer("ref_id").notNull(),
  sessionDate: text("session_date").notNull(), // YYYY-MM-DD (IST)
  startTime: text("start_time").notNull(), // HH:MM 24h (IST)
  status: text("status").notNull().default("scheduled"), // scheduled | completed | cancelled
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Member feedback for the two kick-starter PT trial sessions (Home "fitness
// journey" flow). One row per user + session number (1 or 2), upserted.
export const ptTrialFeedbackTable = pgTable(
  "pt_trial_feedback",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    sessionNo: integer("session_no").notNull(), // 1 | 2
    rating: integer("rating").notNull(), // 1-5 stars
    comment: text("comment").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("pt_trial_feedback_user_session_unique").on(t.userId, t.sessionNo)],
);

// Paid membership-package purchases (YoActiv hosted Razorpay), mirroring
// trainer_bookings: pending row + token, redirect landing flips the status.
export const packageBookingsTable = pgTable("package_bookings", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: integer("user_id"),
  gymId: integer("gym_id").notNull(),
  gymName: text("gym_name").notNull().default(""),
  branchId: integer("branch_id").notNull().default(0),
  memberName: text("member_name").notNull().default(""),
  mobile: text("mobile").notNull().default(""),
  packageName: text("package_name").notNull().default(""),
  serviceName: text("service_name").notNull().default(""),
  amountInr: integer("amount_inr").notNull().default(0),
  // Wallet points applied to this purchase (₹). amountInr is the amount
  // actually charged after the discount; points are debited at paid-flip.
  redeemPointsInr: integer("redeem_points_inr").notNull().default(0),
  // Coupon applied to this purchase (₹ discount already subtracted from
  // amountInr). couponId is an immutable snapshot — redemption at paid-flip
  // settles against the id, so renaming/deleting the coupon can't detach it.
  couponId: integer("coupon_id").notNull().default(0),
  couponCode: text("coupon_code").notNull().default(""),
  couponDiscountInr: integer("coupon_discount_inr").notNull().default(0),
  startDate: text("start_date").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending | paid | failed
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

// Agency portal accounts. Each agency user is a read-only login scoped to a set
// of branches (gymIds) that an admin assigns. They can only view GX class
// bookings for their assigned branches.
export const agencyUsersTable = pgTable("agency_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  gymIds: integer("gym_ids").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Home banner slides shown at the top of the mobile Home screen. Admins manage
// these (images / GIFs uploaded to db-images, or YouTube links). Rendered in
// sortOrder; only active rows are served to members.
export const homeSlidesTable = pgTable("home_slides", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("image"), // image | gif | youtube
  mediaUrl: text("media_url").notNull().default(""), // db-image URL, gif URL, or YouTube URL
  title: text("title").notNull().default(""),
  subtitle: text("subtitle").notNull().default(""),
  ctaLabel: text("cta_label").notNull().default(""),
  ctaUrl: text("cta_url").notNull().default(""),
  audience: text("audience").notNull().default("all"), // all | members | customers
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Admin-managed FAQs: shown to members and fed into the AI assistant as
// gym knowledge, so staff can "teach" the AI without a code change.
export const faqsTable = pgTable("faqs", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category").notNull().default("General"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Admin-created discount coupons for membership packages and PT sessions.
// Codes are stored uppercase. used_count is incremented only at the paid
// flip (a pending purchase that never completes doesn't consume the coupon).
export const couponsTable = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description").notNull().default(""),
  discountType: text("discount_type").notNull().default("percent"), // percent | flat
  discountValue: integer("discount_value").notNull().default(0),
  maxDiscountInr: integer("max_discount_inr").notNull().default(0), // 0 = no cap
  minAmountInr: integer("min_amount_inr").notNull().default(0),
  appliesTo: text("applies_to").notNull().default("all"), // all | membership | pt
  maxUses: integer("max_uses").notNull().default(0), // 0 = unlimited
  usedCount: integer("used_count").notNull().default(0),
  perUserLimit: integer("per_user_limit").notNull().default(1), // 0 = unlimited
  expiresOn: text("expires_on"), // YYYY-MM-DD (IST) or null = never
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One row per successful (paid) use of a coupon.
export const couponRedemptionsTable = pgTable(
  "coupon_redemptions",
  {
    id: serial("id").primaryKey(),
    couponId: integer("coupon_id").notNull(),
    couponCode: text("coupon_code").notNull(),
    userId: integer("user_id"),
    mobile: text("mobile").notNull().default(""),
    kind: text("kind").notNull(), // package | pt
    bookingId: integer("booking_id").notNull(),
    discountInr: integer("discount_inr").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // A booking can consume a coupon exactly once (paid-flip is idempotent).
    uniqueIndex("coupon_redemptions_kind_booking_unique").on(
      t.kind,
      t.bookingId,
    ),
  ],
);

export const trainersTable = pgTable("trainers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  specialty: text("specialty").notNull(),
  bio: text("bio").notNull(),
  photoUrl: text("photo_url").notNull(),
  rating: real("rating").notNull(),
  sessionsCount: integer("sessions_count").notNull(),
  pricePerSession: integer("price_per_session").notNull(),
  certifications: text("certifications").array().notNull().default([]),
  city: text("city").notNull(),
  gymId: integer("gym_id"),
});

export const groupClassScheduleTable = pgTable("group_class_schedule", {
  id: serial("id").primaryKey(),
  gymId: integer("gym_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 1 = Mon … 7 = Sun
  startTime: text("start_time").notNull(), // "07:00"
  endTime: text("end_time").notNull(), // "08:00"
  className: text("class_name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const classSessionsTable = pgTable("class_sessions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  gymId: integer("gym_id").notNull(),
  trainerId: integer("trainer_id").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  durationMin: integer("duration_min").notNull(),
  capacity: integer("capacity").notNull(),
  intensity: text("intensity").notNull(),
  coverImage: text("cover_image").notNull(),
  description: text("description").notNull(),
  equipmentNeeded: text("equipment_needed").array().notNull().default([]),
  calorieEstimate: integer("calorie_estimate").notNull(),
  trendingScore: integer("trending_score").notNull().default(0),
});

export const membershipsTable = pgTable("memberships", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  billingPeriod: text("billing_period").notNull(),
  priceInr: integer("price_inr").notNull(),
  originalPriceInr: integer("original_price_inr").notNull(),
  gymsIncluded: integer("gyms_included").notNull(),
  classesPerMonth: integer("classes_per_month").notNull(),
  perks: text("perks").array().notNull().default([]),
  badge: text("badge").notNull(),
  popular: boolean("popular").notNull().default(false),
  imageUrl: text("image_url").notNull().default(""),
  // 0 = uncategorized; references package_categories.id (plain int, no FK — repo convention)
  categoryId: integer("category_id").notNull().default(0),
});

// Admin-managed grouping for annual packages shown on the app's Packages tab.
export const packageCategoriesTable = pgTable("package_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  imageUrl: text("image_url").notNull().default(""),
});

export const userMembershipsTable = pgTable("user_memberships", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  planId: integer("plan_id").notNull(),
  renewsOn: timestamp("renews_on", { withTimezone: true }).notNull(),
  classesUsed: integer("classes_used").notNull().default(0),
  gymsAccessed: integer("gyms_accessed").notNull().default(0),
  status: text("status").notNull().default("active"),
});

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  classId: integer("class_id").notNull(),
  status: text("status").notNull().default("confirmed"),
  qrCode: text("qr_code").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  // Per-class booked counts (class listings) and per-member booking lists.
  index("bookings_class_id_idx").on(t.classId),
  index("bookings_user_id_idx").on(t.userId),
]);

export const checkinsTable = pgTable("checkins", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  gymId: integer("gym_id").notNull(),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  method: text("method").notNull().default("qr"),
  baseInr: integer("base_inr").notNull().default(0),
  taxPct: integer("tax_pct").notNull().default(0),
  taxInr: integer("tax_inr").notNull().default(0),
  payoutInr: integer("payout_inr").notNull().default(0),
}, (t) => ({
  oncePerDay: uniqueIndex("checkins_user_gym_ist_day_unique").on(
    t.userId,
    t.gymId,
    sql`((${t.checkedInAt} AT TIME ZONE 'Asia/Kolkata')::date)`,
  ),
}));

// ─── Amenities catalog (admin-managed) ───
export const amenitiesTable = pgTable("amenities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default("Dot"),
  category: text("category").notNull().default("general"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Join: which catalog amenities a gym offers
export const gymAmenitiesTable = pgTable(
  "gym_amenities",
  {
    id: serial("id").primaryKey(),
    gymId: integer("gym_id")
      .notNull()
      .references(() => gymsTable.id, { onDelete: "cascade" }),
    amenityId: integer("amenity_id")
      .notNull()
      .references(() => amenitiesTable.id, { onDelete: "cascade" }),
  },
  (t) => ({
    uniq: uniqueIndex("gym_amenities_gym_amenity_unique").on(
      t.gymId,
      t.amenityId,
    ),
  }),
);

// Partner-added custom amenities (outside the master catalog)
export const gymCustomAmenitiesTable = pgTable("gym_custom_amenities", {
  id: serial("id").primaryKey(),
  gymId: integer("gym_id")
    .notNull()
    .references(() => gymsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default("Dot"),
});

// Per-day opening hours; 0=Sunday … 6=Saturday
export const gymHoursTable = pgTable(
  "gym_hours",
  {
    id: serial("id").primaryKey(),
    gymId: integer("gym_id")
      .notNull()
      .references(() => gymsTable.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    isClosed: boolean("is_closed").notNull().default(false),
    openMinute: integer("open_minute").notNull().default(300), // 05:00
    closeMinute: integer("close_minute").notNull().default(1380), // 23:00
  },
  (t) => ({
    uniq: uniqueIndex("gym_hours_gym_day_unique").on(t.gymId, t.dayOfWeek),
  }),
);

// ─── Workouts catalog (admin-managed) ───
export const workoutsTable = pgTable("workouts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default("Dumbbell"),
  color: text("color").notNull().default("from-orange-500 to-amber-500"),
  imageUrl: text("image_url").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Join: which catalog workouts a gym offers
export const gymWorkoutsTable = pgTable(
  "gym_workouts",
  {
    id: serial("id").primaryKey(),
    gymId: integer("gym_id")
      .notNull()
      .references(() => gymsTable.id, { onDelete: "cascade" }),
    workoutId: integer("workout_id")
      .notNull()
      .references(() => workoutsTable.id, { onDelete: "cascade" }),
  },
  (t) => ({
    uniq: uniqueIndex("gym_workouts_gym_workout_unique").on(
      t.gymId,
      t.workoutId,
    ),
  }),
);

// Per-workout session schedule rows; one row per time slot
export const gymWorkoutSessionsTable = pgTable("gym_workout_sessions", {
  id: serial("id").primaryKey(),
  gymId: integer("gym_id")
    .notNull()
    .references(() => gymsTable.id, { onDelete: "cascade" }),
  workoutId: integer("workout_id")
    .notNull()
    .references(() => workoutsTable.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun … 6=Sat
  startMinute: integer("start_minute").notNull().default(360),
  endMinute: integer("end_minute").notNull().default(420),
  instructor: text("instructor").notNull().default(""),
});

export const walletsTable = pgTable(
  "wallets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    balanceInr: integer("balance_inr").notNull().default(0),
    rewardPoints: integer("reward_points").notNull().default(0),
  },
  (t) => [uniqueIndex("wallets_user_id_unique").on(t.userId)],
);

export const walletTransactionsTable = pgTable(
  "wallet_transactions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    label: text("label").notNull(),
    amountInr: integer("amount_inr").notNull(),
    kind: text("kind").notNull(),
    // Idempotency anchor for programmatic credits/debits (e.g. one referral
    // reward per referred buyer, one redemption per booking). '' = manual/legacy.
    refType: text("ref_type").notNull().default(""),
    refId: text("ref_id").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One programmatic credit/debit per reference — the DB-level idempotency
    // guard behind creditWallet/debitWallet (manual/legacy rows keep '').
    uniqueIndex("wallet_tx_ref_unique")
      .on(t.refType, t.refId)
      .where(sql`ref_type <> '' AND ref_id <> ''`),
  ],
);

export const adminsTable = pgTable("admins", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  vendorPartnerId: integer("vendor_partner_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("apparel"),
  priceInr: integer("price_inr").notNull(),
  originalPriceInr: integer("original_price_inr").notNull(),
  imageUrl: text("image_url").notNull(),
  gallery: text("gallery").array().notNull().default([]),
  sizes: text("sizes").array().notNull().default([]),
  colors: text("colors").array().notNull().default([]),
  stock: integer("stock").notNull().default(0),
  status: text("status").notNull().default("active"),
  // GST percentages applied on the sale price at checkout (e.g. 9 = 9%).
  cgstPercent: real("cgst_percent").notNull().default(0),
  sgstPercent: real("sgst_percent").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const productOrdersTable = pgTable("product_orders", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  shippingAddress: text("shipping_address").notNull(),
  shippingCity: text("shipping_city").notNull(),
  shippingPincode: text("shipping_pincode").notNull(),
  totalInr: integer("total_inr").notNull(),
  // Refer & Earn: buyer account (0 = guest) and wallet points applied (₹).
  // totalInr is the payable amount after the points discount.
  userId: integer("user_id").notNull().default(0),
  pointsRedeemedInr: integer("points_redeemed_inr").notNull().default(0),
  // Invoice breakdown snapshot (₹, whole rupees), captured at checkout:
  // totalInr = subtotal + cgst + sgst + shipping − points redeemed.
  subtotalInr: integer("subtotal_inr").notNull().default(0),
  cgstInr: integer("cgst_inr").notNull().default(0),
  sgstInr: integer("sgst_inr").notNull().default(0),
  shippingInr: integer("shipping_inr").notNull().default(0),
  paymentMethod: text("payment_method").notNull().default("cod"),
  // payment_pending → placed (after online payment) | payment_failed;
  // then the fulfillment lifecycle: placed/confirmed/shipped/delivered/cancelled.
  status: text("status").notNull().default("placed"),
  // Online payment (Airpay): unguessable reference used as the gateway order
  // id and in the return/landing URLs; '' for legacy COD rows.
  token: text("token").notNull().default(""),
  // Numeric gateway order id sent to Airpay (they reject non-numeric ids with
  // "Merchant Transaction Id not valid"); regenerated on every payment attempt.
  airpayOrderRef: text("airpay_order_ref").notNull().default(""),
  airpayTxnId: text("airpay_txn_id").notNull().default(""),
  // Online payment (Razorpay): gateway order id ("order_...") created once
  // per order via the Orders API, and the settled payment id ("pay_...").
  razorpayOrderId: text("razorpay_order_id").notNull().default(""),
  razorpayPaymentId: text("razorpay_payment_id").notNull().default(""),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const productOrderItemsTable = pgTable("product_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  vendorPartnerId: integer("vendor_partner_id").notNull(),
  productName: text("product_name").notNull(),
  unitPriceInr: integer("unit_price_inr").notNull(),
  qty: integer("qty").notNull(),
  // Per-item fulfillment status so each vendor manages their own portion of a
  // (possibly multi-vendor) order independently of the order-level status.
  status: text("status").notNull().default("placed"),
  // Snapshot of the chosen variant, e.g. "M / Black" (empty when no variants).
  variant: text("variant").notNull().default(""),
});

// Admin-managed storefront product categories. A code default list is used as a
// fallback until the table is materialized (see routes/store.ts categories).
export const productCategoriesTable = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const partnersTable = pgTable("partners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // NOTE: email is intentionally NOT unique. The product allows multiple
  // partner accounts to share a contact email (e.g. one brand operating
  // several franchise/branch logins). Login disambiguates by bcrypt-checking
  // the supplied password against every matching row.
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  passwordHash: text("password_hash").notNull(),
  status: text("status").notNull().default("pending"),
  city: text("city").notNull(),
  notes: text("notes").notNull().default(""),
  avatarUrl: text("avatar_url").notNull().default(""),
  // kind = "gym" → gym operator (default), "vendor" → store seller,
  // "both"   → can sign in to both the partner portal and the vendor portal.
  kind: text("kind").notNull().default("gym"),
  // Platform commission percentage taken from this vendor's store sales.
  commissionPct: integer("commission_pct").notNull().default(10),
  pendingAmenityIds: integer("pending_amenity_ids")
    .array()
    .notNull()
    .default(sql`'{}'::integer[]`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const staffTable = pgTable("staff", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  username: text("username").unique(),
  gymId: integer("gym_id").references(() => gymsTable.id, {
    onDelete: "restrict",
  }),
  yoactivStaffId: text("yoactiv_staff_id").unique(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  permissions: text("permissions")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const citiesTable = pgTable("cities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const areasTable = pgTable("areas", {
  id: serial("id").primaryKey(),
  cityId: integer("city_id")
    .notNull()
    .references(() => citiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("class"),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull().default(""),
  city: text("city").notNull().default(""),
  classId: integer("class_id"),
  gymId: integer("gym_id"),
  planId: integer("plan_id"),
  className: text("class_name").notNull().default(""),
  gymName: text("gym_name").notNull().default(""),
  planName: text("plan_name").notNull().default(""),
  planPriceInr: integer("plan_price_inr").notNull().default(0),
  preferredDate: text("preferred_date").notNull().default(""),
  preferredTime: text("preferred_time").notNull().default(""),
  message: text("message").notNull().default(""),
  source: text("source").notNull().default("web"),
  status: text("status").notNull().default("new"),
  assignedTo: text("assigned_to").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  // Admin/partner lead lists sort by newest and filter by branch (gym).
  index("leads_created_at_idx").on(t.createdAt),
  index("leads_gym_id_idx").on(t.gymId),
]);

export const partnerLoginTokensTable = pgTable("partner_login_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  partnerId: integer("partner_id")
    .notNull()
    .references(() => partnersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdByEmail: text("created_by_email").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Sub-accounts created BY a partner for their own team members (e.g. front-desk
// staff, branch managers). They sign in through the same partner portal login
// but act on behalf of their parent partner with a limited set of permissions.
export const partnerStaffTable = pgTable("partner_staff", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id")
    .notNull()
    .references(() => partnersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  permissions: text("permissions")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const blogPostsTable = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  content: text("content").notNull().default(""),
  coverImage: text("cover_image").notNull().default(""),
  videoUrl: text("video_url").notNull().default(""),
  author: text("author").notNull().default("GYMCO Team"),
  category: text("category").notNull().default("Fitness"),
  isPublished: boolean("is_published").notNull().default(true),
  publishedAt: timestamp("published_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// In-app notifications. One row per (recipient, notification). For broadcasts,
// the admin sends one logical message that fans out to N rows sharing a batchId.
// recipientType is one of: "user" | "partner" | "vendor" | "admin" | "staff".
// recipientId references the corresponding table (usersTable / partnersTable /
// partnersTable / adminsTable) by id. No FK is enforced because the target
// table varies by recipientType.
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  recipientType: text("recipient_type").notNull(),
  recipientId: integer("recipient_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link").notNull().default(""),
  batchId: text("batch_id").notNull(),
  createdByAdminId: integer("created_by_admin_id").references(
    () => adminsTable.id,
    { onDelete: "set null" },
  ),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  // The per-recipient feed poll (every member's bell) is the single hottest
  // query in the app — it must be an index scan, not a table scan.
  index("notifications_recipient_created_idx").on(
    t.recipientType,
    t.recipientId,
    t.createdAt,
  ),
]);

export const partnerDocumentsTable = pgTable("partner_documents", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id")
    .notNull()
    .references(() => partnersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  notes: text("notes").notNull().default(""),
  uploadedByKind: text("uploaded_by_kind").notNull().default("staff"),
  uploadedByEmail: text("uploaded_by_email").notNull().default(""),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Support / task tickets. Any signed-in role can raise a ticket; admins triage,
// assign, and track them. The requester and (optional) assignee are referenced
// polymorphically by role + id, reusing the same convention as the
// notifications table. requesterRole / assigneeRole is one of:
// "user" | "partner" | "staff" | "admin". No FK is enforced because the target
// table varies by role. Status moves through: open -> in_progress -> resolved
// -> closed. Priority is one of: low | medium | high | urgent.
export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("general"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  requesterRole: text("requester_role").notNull(),
  requesterId: integer("requester_id").notNull(),
  assigneeRole: text("assignee_role"),
  assigneeId: integer("assignee_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const ticketCommentsTable = pgTable("ticket_comments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => ticketsTable.id, { onDelete: "cascade" }),
  authorRole: text("author_role").notNull(),
  authorId: integer("author_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Admin curation of YoActiv packages: which live plans are visible in the
// member-facing purchase flows. YoActiv stays the source of truth for names
// and prices — we only store a hidden flag per (branch, package variation).
// Plain cross-references, no FKs (repo convention).
export const yoactivPackagePrefsTable = pgTable(
  "yoactiv_package_prefs",
  {
    id: serial("id").primaryKey(),
    branchId: integer("branch_id").notNull(),
    packageId: integer("package_id").notNull(),
    // Default-hidden: plans only reach members once an admin explicitly
    // switches them on (pref row with hidden=false).
    hidden: boolean("hidden").notNull().default(true),
    // Display-only overrides; empty string = use the live YoActiv value.
    // Prices are never overridden — payment happens on YoActiv's side.
    displayName: text("display_name").notNull().default(""),
    description: text("description").notNull().default(""),
    imageUrl: text("image_url").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("yoactiv_package_prefs_branch_pkg_uq").on(t.branchId, t.packageId)],
);

// Photos for YoActiv trainers (the YoActiv API has no photo field). Keyed by
// the YoActiv staff id (text), uploaded by admins/partners via the trainer
// directory. Plain cross-reference, no FK (repo convention).
export const trainerPhotosTable = pgTable("trainer_photos", {
  id: serial("id").primaryKey(),
  yoactivTrainerId: text("yoactiv_trainer_id").notNull().unique(),
  imageUrl: text("image_url").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});


export const uploadedImagesTable = pgTable("uploaded_images", {
  id: text("id").primaryKey(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  dataBase64: text("data_base64").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Daily wellness tracking (Iconic Fitness mobile app) ───
// Per-entry logs; daily totals are computed by summing rows for a given
// loggedDate (YYYY-MM-DD, computed in Asia/Kolkata so a "day" matches IST).

export const waterLogsTable = pgTable("water_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  loggedDate: text("logged_date").notNull(),
  amountMl: integer("amount_ml").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const mealLogsTable = pgTable("meal_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  loggedDate: text("logged_date").notNull(),
  mealType: text("meal_type").notNull(),
  name: text("name").notNull(),
  calories: integer("calories").notNull(),
  proteinG: integer("protein_g").notNull().default(0),
  carbsG: integer("carbs_g").notNull().default(0),
  fatG: integer("fat_g").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const workoutLogsTable = pgTable("workout_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  loggedDate: text("logged_date").notNull(),
  type: text("type").notNull(),
  durationMin: integer("duration_min").notNull(),
  calories: integer("calories").notNull().default(0),
  steps: integer("steps").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Challenge definitions live in code (see api-server lib/challenges.ts); only
// the opt-in participants are persisted. Leaderboards are computed live from the
// tracking log tables, so there is no stored progress to keep in sync.
export const challengeParticipantsTable = pgTable(
  "challenge_participants",
  {
    id: serial("id").primaryKey(),
    challengeId: integer("challenge_id").notNull(),
    userId: integer("user_id").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("challenge_participants_challenge_user_unique").on(
      t.challengeId,
      t.userId,
    ),
  }),
);
