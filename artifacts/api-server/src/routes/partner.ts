import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import {
  db,
  partnersTable,
  partnerLoginTokensTable,
  partnerDocumentsTable,
  gymsTable,
  classSessionsTable,
  bookingsTable,
  checkinsTable,
  usersTable,
  trainersTable,
  productsTable,
  productOrdersTable,
  productOrderItemsTable,
  amenitiesTable,
  gymAmenitiesTable,
  gymCustomAmenitiesTable,
  gymHoursTable,
  workoutsTable,
  gymWorkoutsTable,
  gymWorkoutSessionsTable,
  groupClassScheduleTable,
  partnerStaffTable,
  leadsTable,
  trainerBookingsTable,
  packageBookingsTable,
  complaintsTable,
} from "@workspace/db";
import {
  hashPassword,
  verifyPassword,
} from "../lib/adminAuth";
import {
  requirePartner,
  requirePartnerOwner,
  requirePartnerPerm,
  clearPartnerSession,
  PARTNER_STAFF_PERMISSIONS,
} from "../lib/partnerAuth";
import { DEFAULT_GROUP_CLASS_SCHEDULE } from "../lib/groupClassSchedule";
import { fetchTrainerEnquiryRows } from "../lib/trainerEnquiryLeads";
import {
  fetchPtAssignmentMap,
  ptAssignTargetGymId,
  upsertPtAssignment,
} from "../lib/ptAssignments";
import {
  addPtSession,
  deletePtSession,
  listPtSessions,
  setPtSessionStatus,
  validPtSessionInput,
} from "../lib/ptSessions";
import {
  fetchYoactivMemberByMobile,
  fetchYoactivMemberList,
  fetchYoactivBranchTrainers,
  yoactivConfigured,
} from "../lib/yoactiv";
import { yoactivBranchName } from "../lib/yoactivBranchNames";
import {
  trainerPhotoMap,
  setTrainerPhoto,
  removeTrainerPhoto,
} from "../lib/trainerPhotos";
import { notifyMemberOfComplaintUpdate } from "../lib/complaintMemberNotify";
import { notifyOrderStatus } from "../lib/orderNotify";

const router: IRouter = Router();

// ─── Auth ───

router.post(
  "/partner/login",
  async (req: Request, res: Response): Promise<void> => {
    const { email, password } = (req.body ?? {}) as {
      email?: string;
      password?: string;
    };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }
    // Email may match multiple rows (one brand can hold many partner logins
    // that share an email). We try each row and accept the first whose
    // password verifies. Vendor-only and suspended rows are skipped so a
    // valid gym-partner record under the same email can still sign in.
    // Note: an empty candidate list is NOT an early failure — the email may
    // belong to a partner-created team member, handled in the `!partner` block.
    const candidates = await db
      .select()
      .from(partnersTable)
      .where(eq(partnersTable.email, email.toLowerCase().trim()));
    let partner: (typeof candidates)[number] | null = null;
    let sawSuspended = false;
    let sawVendorOnly = false;
    for (const row of candidates) {
      if (row.status === "suspended") {
        sawSuspended = true;
        continue;
      }
      if (row.kind === "vendor") {
        sawVendorOnly = true;
        continue;
      }
      if (await verifyPassword(password, row.passwordHash)) {
        partner = row;
        break;
      }
    }
    if (!partner) {
      // No direct partner match — try partner-created team member (sub-account)
      // logins. These act on behalf of their parent partner.
      const [staff] = await db
        .select()
        .from(partnerStaffTable)
        .where(eq(partnerStaffTable.email, email.toLowerCase().trim()));
      if (staff && staff.isActive && (await verifyPassword(password, staff.passwordHash))) {
        const [parent] = await db
          .select()
          .from(partnersTable)
          .where(eq(partnersTable.id, staff.partnerId));
        if (!parent) {
          res.status(401).json({ error: "Invalid credentials" });
          return;
        }
        if (parent.status === "suspended") {
          res.status(403).json({
            error: "This partner account is suspended. Contact GYMCO support.",
          });
          return;
        }
        if (parent.kind === "vendor") {
          res.status(403).json({
            error:
              "This account belongs to a store vendor and cannot use the partner portal.",
          });
          return;
        }
        req.session.partnerId = parent.id;
        req.session.partnerEmail = staff.email;
        req.session.partnerName = staff.name;
        req.session.partnerStaffId = staff.id;
        req.session.partnerStaffPermissions = staff.permissions;
        res.json({
          id: parent.id,
          email: staff.email,
          name: staff.name,
          phone: parent.phone,
          city: parent.city,
          status: parent.status,
          kind: parent.kind,
          isStaff: true,
          permissions: staff.permissions,
        });
        return;
      }
      if (sawSuspended && !sawVendorOnly) {
        res.status(403).json({
          error: "Your partner account is suspended. Contact GYMCO support.",
        });
        return;
      }
      if (sawVendorOnly && !sawSuspended) {
        res.status(403).json({
          error:
            "This account is a store vendor. Please sign in at the vendor portal (/vendor/login).",
        });
        return;
      }
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    req.session.partnerId = partner.id;
    req.session.partnerEmail = partner.email;
    req.session.partnerName = partner.name;
    // This is the brand owner, not a team member — clear any stale staff flags.
    delete req.session.partnerStaffId;
    delete req.session.partnerStaffPermissions;
    res.json({
      id: partner.id,
      email: partner.email,
      name: partner.name,
      phone: partner.phone,
      city: partner.city,
      status: partner.status,
      kind: partner.kind,
    });
  },
);

// QR sign-in. Admin issues a single-use, short-lived token (see
// /admin/partners/:id/qr-login) and renders it as a QR code. The partner
// scans it from this page on their phone and lands signed in.
router.post(
  "/partner/qr-login",
  async (req: Request, res: Response): Promise<void> => {
    const raw = (req.body ?? {}) as { token?: string };
    let token = (raw.token ?? "").trim();
    // Allow scanning a full URL like https://…/partner/login?token=XXX
    if (token.includes("token=")) {
      try {
        const u = new URL(token);
        const t = u.searchParams.get("token");
        if (t) token = t;
      } catch {
        const m = token.match(/token=([A-Za-z0-9_\-]+)/);
        if (m) token = m[1];
      }
    }
    if (!token) {
      res.status(400).json({ error: "QR code is empty or unreadable." });
      return;
    }
    const [row] = await db
      .select()
      .from(partnerLoginTokensTable)
      .where(eq(partnerLoginTokensTable.token, token));
    if (!row) {
      res.status(401).json({ error: "Invalid QR code." });
      return;
    }
    if (row.usedAt) {
      res
        .status(401)
        .json({ error: "This QR code has already been used. Ask admin for a new one." });
      return;
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      res
        .status(401)
        .json({ error: "This QR code has expired. Ask admin for a new one." });
      return;
    }
    const [partner] = await db
      .select()
      .from(partnersTable)
      .where(eq(partnersTable.id, row.partnerId));
    if (!partner) {
      res.status(404).json({ error: "Partner not found" });
      return;
    }
    if (partner.status === "suspended") {
      res.status(403).json({
        error: "Your partner account is suspended. Contact GYMCO support.",
      });
      return;
    }
    if (partner.kind === "vendor") {
      res.status(403).json({
        error:
          "This account is a store vendor. Please sign in at the vendor portal.",
      });
      return;
    }
    await db
      .update(partnerLoginTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(partnerLoginTokensTable.id, row.id));
    req.session.partnerId = partner.id;
    req.session.partnerEmail = partner.email;
    req.session.partnerName = partner.name;
    delete req.session.partnerStaffId;
    delete req.session.partnerStaffPermissions;
    res.json({
      id: partner.id,
      email: partner.email,
      name: partner.name,
      phone: partner.phone,
      city: partner.city,
      status: partner.status,
      kind: partner.kind,
    });
  },
);

// ─── Vendor (store) auth ─────────────────────────────────────────────────────
// Vendors share the `partners` table but have `kind` in ("vendor", "both"). The
// vendor portal lives at /vendor and only exposes store-related screens. We
// reuse the partner session, but the dedicated /vendor/login endpoint refuses
// any partner whose kind is "gym" so gym operators can't accidentally land in
// the vendor portal.
router.post(
  "/vendor/login",
  async (req: Request, res: Response): Promise<void> => {
    const { email, password } = (req.body ?? {}) as {
      email?: string;
      password?: string;
    };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }
    // Multiple rows may share an email — pick the first vendor-eligible row
    // whose password verifies.
    const candidates = await db
      .select()
      .from(partnersTable)
      .where(eq(partnersTable.email, email.toLowerCase().trim()));
    if (candidates.length === 0) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    let partner: (typeof candidates)[number] | null = null;
    let sawSuspended = false;
    let sawNonVendor = false;
    for (const row of candidates) {
      if (row.status === "suspended") {
        sawSuspended = true;
        continue;
      }
      if (row.kind !== "vendor" && row.kind !== "both") {
        sawNonVendor = true;
        continue;
      }
      if (await verifyPassword(password, row.passwordHash)) {
        partner = row;
        break;
      }
    }
    if (!partner) {
      if (sawSuspended && !sawNonVendor) {
        res.status(403).json({
          error: "Your vendor account is suspended. Contact GYMCO support.",
        });
        return;
      }
      if (sawNonVendor && !sawSuspended) {
        res.status(403).json({
          error: "This account is not registered as a store vendor.",
        });
        return;
      }
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    req.session.partnerId = partner.id;
    req.session.partnerEmail = partner.email;
    req.session.partnerName = partner.name;
    delete req.session.partnerStaffId;
    delete req.session.partnerStaffPermissions;
    res.json({
      id: partner.id,
      email: partner.email,
      name: partner.name,
      phone: partner.phone,
      city: partner.city,
      status: partner.status,
      kind: partner.kind,
    });
  },
);

router.get(
  "/vendor/me",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const [partner] = await db
      .select()
      .from(partnersTable)
      .where(eq(partnersTable.id, req.session.partnerId!));
    if (!partner) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (partner.kind !== "vendor" && partner.kind !== "both") {
      res.status(403).json({ error: "Not a vendor account" });
      return;
    }
    res.json({
      id: partner.id,
      email: partner.email,
      name: partner.name,
      phone: partner.phone,
      city: partner.city,
      status: partner.status,
      kind: partner.kind,
      notes: partner.notes,
      createdAt: partner.createdAt,
    });
  },
);

router.post("/vendor/logout", (req: Request, res: Response): void => {
  clearPartnerSession(req);
  res.json({ ok: true });
});

router.post("/partner/logout", (req: Request, res: Response): void => {
  // Only kill partner session keys; keep admin session intact in case both exist.
  clearPartnerSession(req);
  res.json({ ok: true });
});

router.get(
  "/partner/me",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const [partner] = await db
      .select()
      .from(partnersTable)
      .where(eq(partnersTable.id, req.session.partnerId!));
    if (!partner) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (partner.kind === "vendor") {
      res.status(403).json({ error: "Not a gym partner account" });
      return;
    }
    const isStaff = Boolean(req.session.partnerStaffId);
    res.json({
      id: partner.id,
      email: isStaff ? req.session.partnerEmail! : partner.email,
      name: isStaff ? req.session.partnerName! : partner.name,
      phone: partner.phone,
      city: partner.city,
      status: partner.status,
      kind: partner.kind,
      avatarUrl: partner.avatarUrl,
      notes: partner.notes,
      createdAt: partner.createdAt,
      isStaff,
      permissions: isStaff
        ? (req.session.partnerStaffPermissions ?? [])
        : [...PARTNER_STAFF_PERMISSIONS],
    });
  },
);

router.post(
  "/partner/change-password",
  requirePartner,
  requirePartnerOwner,
  async (req: Request, res: Response): Promise<void> => {
    const { currentPassword, newPassword } = (req.body ?? {}) as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      res
        .status(400)
        .json({ error: "Current password and new password (6+ chars) required" });
      return;
    }
    const [partner] = await db
      .select()
      .from(partnersTable)
      .where(eq(partnersTable.id, req.session.partnerId!));
    if (!partner) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const ok = await verifyPassword(currentPassword, partner.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }
    const passwordHash = await hashPassword(newPassword);
    await db
      .update(partnersTable)
      .set({ passwordHash })
      .where(eq(partnersTable.id, partner.id));
    res.json({ ok: true });
  },
);

router.patch(
  "/partner/me",
  requirePartner,
  requirePartnerOwner,
  async (req: Request, res: Response): Promise<void> => {
    const { name, phone, city, avatarUrl } = (req.body ?? {}) as Record<
      string,
      string | undefined
    >;
    const [updated] = await db
      .update(partnersTable)
      .set({
        ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone }),
        ...(city !== undefined && { city }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      })
      .where(eq(partnersTable.id, req.session.partnerId!))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    req.session.partnerName = updated.name;
    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      phone: updated.phone,
      city: updated.city,
      status: updated.status,
      avatarUrl: updated.avatarUrl,
      kind: updated.kind,
    });
  },
);

// ─── Team (partner-created staff sub-accounts) ───
// All routes here are owner-only: a partner-created team member cannot manage
// other team members.

function sanitizePerms(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return PARTNER_STAFF_PERMISSIONS.filter((p) => input.includes(p));
}

router.get(
  "/partner/staff",
  requirePartner,
  requirePartnerOwner,
  async (req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select({
        id: partnerStaffTable.id,
        name: partnerStaffTable.name,
        email: partnerStaffTable.email,
        permissions: partnerStaffTable.permissions,
        isActive: partnerStaffTable.isActive,
        createdAt: partnerStaffTable.createdAt,
      })
      .from(partnerStaffTable)
      .where(eq(partnerStaffTable.partnerId, req.session.partnerId!))
      .orderBy(asc(partnerStaffTable.name));
    res.json(rows);
  },
);

router.post(
  "/partner/staff",
  requirePartner,
  requirePartnerOwner,
  async (req: Request, res: Response): Promise<void> => {
    const { name, email, password, permissions } = (req.body ?? {}) as {
      name?: string;
      email?: string;
      password?: string;
      permissions?: unknown;
    };
    const cleanName = (name ?? "").trim();
    const cleanEmail = (email ?? "").toLowerCase().trim();
    if (!cleanName || !cleanEmail || !password || password.length < 6) {
      res.status(400).json({
        error: "Name, email and a password (6+ characters) are required.",
      });
      return;
    }
    // Email must be unique across both partner logins and team accounts so the
    // login route can resolve it unambiguously.
    const [existingPartner] = await db
      .select({ id: partnersTable.id })
      .from(partnersTable)
      .where(eq(partnersTable.email, cleanEmail));
    const [existingStaff] = await db
      .select({ id: partnerStaffTable.id })
      .from(partnerStaffTable)
      .where(eq(partnerStaffTable.email, cleanEmail));
    if (existingPartner || existingStaff) {
      res.status(409).json({ error: "That email is already in use." });
      return;
    }
    const passwordHash = await hashPassword(password);
    const [created] = await db
      .insert(partnerStaffTable)
      .values({
        partnerId: req.session.partnerId!,
        name: cleanName,
        email: cleanEmail,
        passwordHash,
        permissions: sanitizePerms(permissions),
      })
      .returning({
        id: partnerStaffTable.id,
        name: partnerStaffTable.name,
        email: partnerStaffTable.email,
        permissions: partnerStaffTable.permissions,
        isActive: partnerStaffTable.isActive,
        createdAt: partnerStaffTable.createdAt,
      });
    res.status(201).json(created);
  },
);

router.patch(
  "/partner/staff/:id",
  requirePartner,
  requirePartnerOwner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [existing] = await db
      .select()
      .from(partnerStaffTable)
      .where(
        and(
          eq(partnerStaffTable.id, id),
          eq(partnerStaffTable.partnerId, req.session.partnerId!),
        ),
      );
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { name, permissions, isActive } = (req.body ?? {}) as {
      name?: string;
      permissions?: unknown;
      isActive?: boolean;
    };
    const [updated] = await db
      .update(partnerStaffTable)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(permissions !== undefined && {
          permissions: sanitizePerms(permissions),
        }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      })
      .where(eq(partnerStaffTable.id, id))
      .returning({
        id: partnerStaffTable.id,
        name: partnerStaffTable.name,
        email: partnerStaffTable.email,
        permissions: partnerStaffTable.permissions,
        isActive: partnerStaffTable.isActive,
        createdAt: partnerStaffTable.createdAt,
      });
    res.json(updated);
  },
);

router.post(
  "/partner/staff/:id/reset-password",
  requirePartner,
  requirePartnerOwner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const { newPassword } = (req.body ?? {}) as { newPassword?: string };
    if (!newPassword || newPassword.length < 6) {
      res
        .status(400)
        .json({ error: "New password (6+ characters) is required." });
      return;
    }
    const [existing] = await db
      .select({ id: partnerStaffTable.id })
      .from(partnerStaffTable)
      .where(
        and(
          eq(partnerStaffTable.id, id),
          eq(partnerStaffTable.partnerId, req.session.partnerId!),
        ),
      );
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const passwordHash = await hashPassword(newPassword);
    await db
      .update(partnerStaffTable)
      .set({ passwordHash })
      .where(eq(partnerStaffTable.id, id));
    res.json({ ok: true });
  },
);

router.delete(
  "/partner/staff/:id",
  requirePartner,
  requirePartnerOwner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const result = await db
      .delete(partnerStaffTable)
      .where(
        and(
          eq(partnerStaffTable.id, id),
          eq(partnerStaffTable.partnerId, req.session.partnerId!),
        ),
      )
      .returning({ id: partnerStaffTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  },
);

// Centralized access gate for partner-created team members. The owner
// (no partnerStaffId) always passes. Auth, profile, password and team routes
// are all registered above this point, so they are unaffected. Every
// operational route below maps to a permission; routes a team member must
// never reach (brand documents) are owner-only.
//
// This guard is FAIL-CLOSED: a staff member may only reach a `/partner/*`
// route that is explicitly permission-mapped here OR explicitly listed in
// STAFF_OPEN_PREFIXES (dashboard data everyone sees). Any new operational
// route that is added later and left unclassified is denied for staff by
// default, so mapping drift can never silently widen staff access.
const STAFF_PERMISSION_PREFIXES: ReadonlyArray<[string, string]> = [
  ["/partner/gyms", "gyms"],
  ["/partner/amenities", "gyms"],
  ["/partner/workouts", "gyms"],
  ["/partner/bookings", "bookings"],
  ["/partner/gx-bookings", "classes"],
  ["/partner/leads", "bookings"],
  ["/partner/complaints", "bookings"],
  ["/partner/trainer-bookings", "classes"],
  ["/partner/package-bookings", "bookings"],
  ["/partner/yoactiv", "bookings"],
  ["/partner/classes", "classes"],
  ["/partner/trainers", "classes"],
  ["/partner/schedule", "classes"],
  ["/partner/products", "products"],
  ["/partner/orders", "products"],
  ["/partner/store-stats", "products"],
];
const STAFF_OWNER_ONLY_PREFIXES: ReadonlyArray<string> = ["/partner/documents"];
// Routes open to every signed-in team member regardless of permissions
// (the dashboard summary cards). These need no specific permission.
const STAFF_OPEN_PREFIXES: ReadonlyArray<string> = [
  "/partner/stats",
  "/partner/earnings",
];

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

// Note: this guard runs before each operational route's own `requirePartner`,
// so it must source permissions from the DB itself (not the session snapshot)
// to make grants/revocations and disabling take effect immediately.
router.use(async (req: Request, res: Response, next): Promise<void> => {
  if (!req.session.partnerStaffId) {
    next();
    return;
  }
  // Non-operational routes (login/logout/me/etc.) are registered before this
  // guard and never reach it; only `/partner/*` operational routes do.
  if (!matchesPrefix(req.path, "/partner")) {
    next();
    return;
  }
  if (STAFF_OWNER_ONLY_PREFIXES.some((p) => matchesPrefix(req.path, p))) {
    res
      .status(403)
      .json({ error: "Only the partner account owner can do this." });
    return;
  }
  if (STAFF_OPEN_PREFIXES.some((p) => matchesPrefix(req.path, p))) {
    next();
    return;
  }
  const matched = STAFF_PERMISSION_PREFIXES.find(([prefix]) =>
    matchesPrefix(req.path, prefix),
  );
  if (!matched) {
    // Fail closed: unclassified operational route is off-limits to staff.
    res.status(403).json({ error: "You do not have access to this section." });
    return;
  }
  const [staff] = await db
    .select({
      isActive: partnerStaffTable.isActive,
      partnerId: partnerStaffTable.partnerId,
      permissions: partnerStaffTable.permissions,
    })
    .from(partnerStaffTable)
    .where(eq(partnerStaffTable.id, req.session.partnerStaffId));
  if (!staff || !staff.isActive || staff.partnerId !== req.session.partnerId) {
    clearPartnerSession(req);
    res.status(401).json({ error: "Your access has been revoked." });
    return;
  }
  req.session.partnerStaffPermissions = staff.permissions;
  if (!staff.permissions.includes(matched[1])) {
    res.status(403).json({ error: "You do not have access to this section." });
    return;
  }
  next();
});

// ─── Helpers ───

async function ownedGymIds(partnerId: number): Promise<number[]> {
  const rows = await db
    .select({ id: gymsTable.id })
    .from(gymsTable)
    .where(eq(gymsTable.ownerPartnerId, partnerId));
  return rows.map((r) => r.id);
}

// ─── Gyms ───

router.get(
  "/partner/gyms",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(gymsTable)
      .where(eq(gymsTable.ownerPartnerId, req.session.partnerId!))
      .orderBy(desc(gymsTable.id));
    res.json(rows);
  },
);

router.patch(
  "/partner/gyms/:id",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const k of [
      "name",
      "address",
      "area",
      "city",
      "about",
      "hours",
      "heroImage",
      "logoUrl",
    ]) {
      if (b[k] !== undefined) patch[k] = String(b[k]);
    }
    for (const k of ["priceFrom"]) {
      if (b[k] !== undefined) patch[k] = Number(b[k]);
    }
    for (const k of ["lat", "lng"]) {
      if (b[k] !== undefined && b[k] !== null && b[k] !== "") {
        const n = Number(b[k]);
        if (Number.isFinite(n)) patch[k] = n;
      }
    }
    for (const k of ["openNow"]) {
      if (b[k] !== undefined) patch[k] = Boolean(b[k]);
    }
    for (const k of ["categories", "amenities", "gallery"]) {
      if (Array.isArray(b[k])) patch[k] = b[k] as string[];
    }
    if (b.videoUrl !== undefined) {
      patch.videoUrl =
        b.videoUrl === null || b.videoUrl === ""
          ? null
          : String(b.videoUrl);
    }
    // Atomic authz: only succeeds if the gym still belongs to this partner.
    const [updated] = await db
      .update(gymsTable)
      .set(patch)
      .where(
        and(
          eq(gymsTable.id, id),
          eq(gymsTable.ownerPartnerId, req.session.partnerId!),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(updated);
  },
);

// ─── Stats / Dashboard ───

router.get(
  "/partner/stats",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const gymIds = await ownedGymIds(req.session.partnerId!);
    if (gymIds.length === 0) {
      res.json({
        totalGyms: 0,
        totalClasses: 0,
        totalBookings: 0,
        totalCheckins: 0,
        revenueInr: 0,
        activitySeries: [],
        topGyms: [],
        recentCheckins: [],
      });
      return;
    }

    const classRows = await db
      .select({ id: classSessionsTable.id })
      .from(classSessionsTable)
      .where(inArray(classSessionsTable.gymId, gymIds));
    const classIds = classRows.map((r) => r.id);

    const [bookingCount] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(bookingsTable)
      .where(
        classIds.length > 0
          ? inArray(bookingsTable.classId, classIds)
          : sql`false`,
      );
    const [checkinCount] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(checkinsTable)
      .where(inArray(checkinsTable.gymId, gymIds));

    // 7-day activity series
    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);
    const series: { day: string; checkins: number; bookings: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const [c] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(checkinsTable)
        .where(
          and(
            inArray(checkinsTable.gymId, gymIds),
            gte(checkinsTable.checkedInAt, d),
            sql`${checkinsTable.checkedInAt} < ${next}`,
          ),
        );
      const [b] =
        classIds.length > 0
          ? await db
              .select({ c: sql<number>`count(*)::int` })
              .from(bookingsTable)
              .where(
                and(
                  inArray(bookingsTable.classId, classIds),
                  gte(bookingsTable.createdAt, d),
                  sql`${bookingsTable.createdAt} < ${next}`,
                ),
              )
          : [{ c: 0 }];
      series.push({
        day: d.toLocaleDateString("en-US", { weekday: "short" }),
        checkins: c?.c ?? 0,
        bookings: b?.c ?? 0,
      });
    }

    const topGymsRaw = await db
      .select({
        gymId: checkinsTable.gymId,
        c: sql<number>`count(*)::int`,
      })
      .from(checkinsTable)
      .where(inArray(checkinsTable.gymId, gymIds))
      .groupBy(checkinsTable.gymId)
      .orderBy(sql`count(*) desc`)
      .limit(5);
    const gymNameRows = await db
      .select({ id: gymsTable.id, name: gymsTable.name })
      .from(gymsTable)
      .where(inArray(gymsTable.id, gymIds));
    const gymName = new Map(gymNameRows.map((g) => [g.id, g.name]));
    const topGyms = topGymsRaw.map((r) => ({
      gymId: r.gymId,
      name: gymName.get(r.gymId) ?? `Gym ${r.gymId}`,
      checkins: r.c,
    }));

    const recentCheckins = await db
      .select({
        id: checkinsTable.id,
        userId: checkinsTable.userId,
        gymId: checkinsTable.gymId,
        checkedInAt: checkinsTable.checkedInAt,
        method: checkinsTable.method,
      })
      .from(checkinsTable)
      .where(inArray(checkinsTable.gymId, gymIds))
      .orderBy(desc(checkinsTable.checkedInAt))
      .limit(10);

    // Rough revenue estimate: bookings × avg priceFrom
    const [{ avg }] = await db
      .select({ avg: sql<number>`coalesce(avg(${gymsTable.priceFrom}), 0)::int` })
      .from(gymsTable)
      .where(inArray(gymsTable.id, gymIds));
    const bookings = bookingCount?.c ?? 0;
    const revenueInr = bookings * Number(avg ?? 0);

    res.json({
      totalGyms: gymIds.length,
      totalClasses: classIds.length,
      totalBookings: bookings,
      totalCheckins: checkinCount?.c ?? 0,
      revenueInr,
      activitySeries: series,
      topGyms,
      recentCheckins,
    });
  },
);

// ─── Bookings ───

router.get(
  "/partner/bookings",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const gymIds = await ownedGymIds(req.session.partnerId!);
    if (gymIds.length === 0) {
      res.json([]);
      return;
    }
    const rows = await db
      .select({
        id: bookingsTable.id,
        status: bookingsTable.status,
        createdAt: bookingsTable.createdAt,
        classTitle: classSessionsTable.title,
        startsAt: classSessionsTable.startsAt,
        gymId: classSessionsTable.gymId,
        gymName: gymsTable.name,
        userName: usersTable.name,
        userEmail: usersTable.email,
      })
      .from(bookingsTable)
      .innerJoin(
        classSessionsTable,
        eq(bookingsTable.classId, classSessionsTable.id),
      )
      .innerJoin(gymsTable, eq(classSessionsTable.gymId, gymsTable.id))
      .innerJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
      .where(inArray(classSessionsTable.gymId, gymIds))
      .orderBy(desc(bookingsTable.createdAt))
      .limit(200);
    res.json(rows);
  },
);

router.get(
  "/partner/earnings",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const gymIds = await ownedGymIds(req.session.partnerId!);
    const empty = {
      today: { visits: 0, payoutInr: 0 },
      week: { visits: 0, payoutInr: 0 },
      month: { visits: 0, payoutInr: 0 },
    };
    if (gymIds.length === 0) {
      res.json(empty);
      return;
    }
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - 6);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const sumSince = async (since: Date) => {
      const [row] = await db
        .select({
          visits: sql<number>`count(*)::int`,
          payoutInr: sql<number>`coalesce(sum(${checkinsTable.payoutInr}), 0)::int`,
        })
        .from(checkinsTable)
        .where(
          and(
            inArray(checkinsTable.gymId, gymIds),
            gte(checkinsTable.checkedInAt, since),
          ),
        );
      return {
        visits: Number(row?.visits ?? 0),
        payoutInr: Number(row?.payoutInr ?? 0),
      };
    };

    res.json({
      today: await sumSince(startOfDay),
      week: await sumSince(startOfWeek),
      month: await sumSince(startOfMonth),
    });
  },
);

// ─── Amenities & Hours per gym ───

router.get(
  "/partner/amenities/catalog",
  requirePartner,
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(amenitiesTable)
      .where(eq(amenitiesTable.isActive, true))
      .orderBy(asc(amenitiesTable.sortOrder), asc(amenitiesTable.name));
    res.json(rows);
  },
);

router.get(
  "/partner/gyms/:id/amenities",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!(await ensureOwnsGym(req.session.partnerId!, id))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const selected = await db
      .select({ amenityId: gymAmenitiesTable.amenityId })
      .from(gymAmenitiesTable)
      .where(eq(gymAmenitiesTable.gymId, id));
    const custom = await db
      .select()
      .from(gymCustomAmenitiesTable)
      .where(eq(gymCustomAmenitiesTable.gymId, id))
      .orderBy(asc(gymCustomAmenitiesTable.id));
    res.json({
      catalogIds: selected.map((s) => s.amenityId),
      custom,
    });
  },
);

router.put(
  "/partner/gyms/:id/amenities",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!(await ensureOwnsGym(req.session.partnerId!, id))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const b = (req.body ?? {}) as {
      catalogIds?: number[];
      custom?: { name: string; description?: string; icon?: string }[];
    };
    const rawIds = Array.isArray(b.catalogIds)
      ? Array.from(new Set(b.catalogIds.map((n) => Number(n)).filter(Boolean)))
      : [];
    let catalogIds: number[] = [];
    if (rawIds.length > 0) {
      const valid = await db
        .select({ id: amenitiesTable.id })
        .from(amenitiesTable)
        .where(
          and(
            inArray(amenitiesTable.id, rawIds),
            eq(amenitiesTable.isActive, true),
          ),
        );
      catalogIds = valid.map((v) => v.id);
    }
    const custom = Array.isArray(b.custom)
      ? b.custom
          .map((c) => ({
            name: String(c?.name ?? "").trim(),
            description: String(c?.description ?? ""),
            icon: String(c?.icon ?? "Dot"),
          }))
          .filter((c) => c.name)
      : [];

    await db.transaction(async (tx) => {
      await tx.delete(gymAmenitiesTable).where(eq(gymAmenitiesTable.gymId, id));
      if (catalogIds.length > 0) {
        await tx
          .insert(gymAmenitiesTable)
          .values(catalogIds.map((amenityId) => ({ gymId: id, amenityId })));
      }
      await tx
        .delete(gymCustomAmenitiesTable)
        .where(eq(gymCustomAmenitiesTable.gymId, id));
      if (custom.length > 0) {
        await tx
          .insert(gymCustomAmenitiesTable)
          .values(custom.map((c) => ({ gymId: id, ...c })));
      }
    });

    res.json({ ok: true });
  },
);

router.get(
  "/partner/gyms/:id/hours",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!(await ensureOwnsGym(req.session.partnerId!, id))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const rows = await db
      .select()
      .from(gymHoursTable)
      .where(eq(gymHoursTable.gymId, id))
      .orderBy(asc(gymHoursTable.dayOfWeek));
    // Pad with defaults for any missing day
    const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));
    const out = Array.from({ length: 7 }, (_, d) =>
      byDay.get(d) ?? {
        id: 0,
        gymId: id,
        dayOfWeek: d,
        isClosed: false,
        openMinute: 300,
        closeMinute: 1380,
      },
    );
    res.json(out);
  },
);

router.put(
  "/partner/gyms/:id/hours",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!(await ensureOwnsGym(req.session.partnerId!, id))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const b = (req.body ?? {}) as {
      hours?: {
        dayOfWeek: number;
        isClosed: boolean;
        openMinute: number;
        closeMinute: number;
      }[];
    };
    if (!Array.isArray(b.hours)) {
      res.status(400).json({ error: "hours[] required" });
      return;
    }
    const clamp = (n: number) =>
      Math.max(0, Math.min(1440, Math.round(Number(n) || 0)));
    const byDay = new Map<number, {
      gymId: number;
      dayOfWeek: number;
      isClosed: boolean;
      openMinute: number;
      closeMinute: number;
    }>();
    for (const h of b.hours) {
      const day = Number(h.dayOfWeek);
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      byDay.set(day, {
        gymId: id,
        dayOfWeek: day,
        isClosed: Boolean(h.isClosed),
        openMinute: clamp(h.openMinute ?? 300),
        closeMinute: clamp(h.closeMinute ?? 1380),
      });
    }
    const cleaned = Array.from(byDay.values());
    await db.transaction(async (tx) => {
      await tx.delete(gymHoursTable).where(eq(gymHoursTable.gymId, id));
      if (cleaned.length > 0) {
        await tx.insert(gymHoursTable).values(cleaned);
      }
    });
    res.json({ ok: true });
  },
);

// ─── Workouts ───

router.get(
  "/partner/workouts/catalog",
  requirePartner,
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(workoutsTable)
      .where(eq(workoutsTable.isActive, true))
      .orderBy(asc(workoutsTable.sortOrder), asc(workoutsTable.name));
    res.json(rows);
  },
);

router.get(
  "/partner/gyms/:id/workouts",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!(await ensureOwnsGym(req.session.partnerId!, id))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const selected = await db
      .select({ workoutId: gymWorkoutsTable.workoutId })
      .from(gymWorkoutsTable)
      .where(eq(gymWorkoutsTable.gymId, id));
    res.json({ workoutIds: selected.map((s) => s.workoutId) });
  },
);

router.put(
  "/partner/gyms/:id/workouts",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!(await ensureOwnsGym(req.session.partnerId!, id))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const b = (req.body ?? {}) as { workoutIds?: number[] };
    const rawIds = Array.isArray(b.workoutIds)
      ? Array.from(new Set(b.workoutIds.map((n) => Number(n)).filter(Boolean)))
      : [];
    let workoutIds: number[] = [];
    if (rawIds.length > 0) {
      const valid = await db
        .select({ id: workoutsTable.id })
        .from(workoutsTable)
        .where(
          and(
            inArray(workoutsTable.id, rawIds),
            eq(workoutsTable.isActive, true),
          ),
        );
      workoutIds = valid.map((v) => v.id);
    }
    await db.transaction(async (tx) => {
      await tx.delete(gymWorkoutsTable).where(eq(gymWorkoutsTable.gymId, id));
      if (workoutIds.length > 0) {
        await tx
          .insert(gymWorkoutsTable)
          .values(workoutIds.map((workoutId) => ({ gymId: id, workoutId })));
      }
      // Drop sessions for workouts no longer offered
      if (workoutIds.length === 0) {
        await tx
          .delete(gymWorkoutSessionsTable)
          .where(eq(gymWorkoutSessionsTable.gymId, id));
      } else {
        await tx
          .delete(gymWorkoutSessionsTable)
          .where(
            and(
              eq(gymWorkoutSessionsTable.gymId, id),
              sql`${gymWorkoutSessionsTable.workoutId} NOT IN (${sql.join(
                workoutIds.map((wid) => sql`${wid}`),
                sql`, `,
              )})`,
            ),
          );
      }
    });
    res.json({ ok: true });
  },
);

router.get(
  "/partner/gyms/:id/workouts/sessions",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!(await ensureOwnsGym(req.session.partnerId!, id))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const rows = await db
      .select()
      .from(gymWorkoutSessionsTable)
      .where(eq(gymWorkoutSessionsTable.gymId, id))
      .orderBy(
        asc(gymWorkoutSessionsTable.workoutId),
        asc(gymWorkoutSessionsTable.dayOfWeek),
        asc(gymWorkoutSessionsTable.startMinute),
      );
    res.json(rows);
  },
);

router.put(
  "/partner/gyms/:id/workouts/sessions",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!(await ensureOwnsGym(req.session.partnerId!, id))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const b = (req.body ?? {}) as {
      sessions?: {
        workoutId: number;
        dayOfWeek: number;
        startMinute: number;
        endMinute: number;
        instructor?: string;
      }[];
    };
    if (!Array.isArray(b.sessions)) {
      res.status(400).json({ error: "sessions[] required" });
      return;
    }
    // Constrain workoutIds to those this gym actually offers
    const owned = await db
      .select({ workoutId: gymWorkoutsTable.workoutId })
      .from(gymWorkoutsTable)
      .where(eq(gymWorkoutsTable.gymId, id));
    const allowed = new Set(owned.map((o) => o.workoutId));
    const clamp = (n: number) =>
      Math.max(0, Math.min(1440, Math.round(Number(n) || 0)));
    const cleaned = b.sessions
      .map((s) => ({
        gymId: id,
        workoutId: Number(s.workoutId),
        dayOfWeek: Number(s.dayOfWeek),
        startMinute: clamp(s.startMinute ?? 0),
        endMinute: clamp(s.endMinute ?? 0),
        instructor: String(s.instructor ?? "").trim(),
      }))
      .filter(
        (s) =>
          allowed.has(s.workoutId) &&
          Number.isInteger(s.dayOfWeek) &&
          s.dayOfWeek >= 0 &&
          s.dayOfWeek <= 6 &&
          s.endMinute > s.startMinute,
      );
    await db.transaction(async (tx) => {
      await tx
        .delete(gymWorkoutSessionsTable)
        .where(eq(gymWorkoutSessionsTable.gymId, id));
      if (cleaned.length > 0) {
        await tx.insert(gymWorkoutSessionsTable).values(cleaned);
      }
    });
    res.json({ ok: true });
  },
);

// ─── Classes ───

router.get(
  "/partner/classes",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const gymIds = await ownedGymIds(req.session.partnerId!);
    if (gymIds.length === 0) {
      res.json([]);
      return;
    }
    const rows = await db
      .select({
        id: classSessionsTable.id,
        title: classSessionsTable.title,
        category: classSessionsTable.category,
        startsAt: classSessionsTable.startsAt,
        durationMin: classSessionsTable.durationMin,
        capacity: classSessionsTable.capacity,
        intensity: classSessionsTable.intensity,
        gymId: classSessionsTable.gymId,
        gymName: gymsTable.name,
        trainerId: classSessionsTable.trainerId,
        trainerName: trainersTable.name,
        coverImage: classSessionsTable.coverImage,
        description: classSessionsTable.description,
        calorieEstimate: classSessionsTable.calorieEstimate,
      })
      .from(classSessionsTable)
      .innerJoin(gymsTable, eq(classSessionsTable.gymId, gymsTable.id))
      .leftJoin(
        trainersTable,
        eq(classSessionsTable.trainerId, trainersTable.id),
      )
      .where(inArray(classSessionsTable.gymId, gymIds))
      .orderBy(desc(classSessionsTable.startsAt))
      .limit(200);

    // Per-class booking counts (active = not cancelled).
    const classIds = rows.map((r) => r.id);
    const counts = classIds.length
      ? await db
          .select({
            classId: bookingsTable.classId,
            total: sql<number>`count(*)::int`,
            active: sql<number>`sum(case when ${bookingsTable.status} <> 'cancelled' then 1 else 0 end)::int`,
            completed: sql<number>`sum(case when ${bookingsTable.status} = 'completed' then 1 else 0 end)::int`,
          })
          .from(bookingsTable)
          .where(inArray(bookingsTable.classId, classIds))
          .groupBy(bookingsTable.classId)
      : [];
    const byClass = new Map(counts.map((c) => [c.classId, c]));
    res.json(
      rows.map((r) => {
        const c = byClass.get(r.id);
        return {
          ...r,
          bookedCount: c?.active ?? 0,
          completedCount: c?.completed ?? 0,
          totalBookings: c?.total ?? 0,
        };
      }),
    );
  },
);

// GX (group class) booking enquiries for the partner's gyms. These come in as
// leads (kind="class") from the public "Book a GX Class" page / class-detail
// CTA. There is no seat cap on GX slots, so this simply surfaces every booking
// the partner can act on; the frontend groups them by branch + day + slot.
router.get(
  "/partner/gx-bookings",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const gymIds = await ownedGymIds(req.session.partnerId!);
    if (gymIds.length === 0) {
      res.json([]);
      return;
    }
    const rows = await db
      .select({
        id: leadsTable.id,
        gymId: leadsTable.gymId,
        gymName: leadsTable.gymName,
        className: leadsTable.className,
        name: leadsTable.name,
        phone: leadsTable.phone,
        email: leadsTable.email,
        preferredDate: leadsTable.preferredDate,
        preferredTime: leadsTable.preferredTime,
        status: leadsTable.status,
        source: leadsTable.source,
        createdAt: leadsTable.createdAt,
      })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.kind, "class"),
          inArray(leadsTable.gymId, gymIds),
        ),
      )
      .orderBy(desc(leadsTable.preferredDate), asc(leadsTable.preferredTime))
      .limit(5000);
    res.json(rows);
  },
);

// CRM leads scoped to the partner's branches — includes leads imported by the
// admin via Excel with a branch number. Status is editable via the PATCH
// route below; everything else stays admin-managed.
router.get(
  "/partner/leads",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const gymIds = await ownedGymIds(req.session.partnerId!);
    if (gymIds.length === 0) {
      res.json([]);
      return;
    }
    const rows = await db
      .select({
        id: leadsTable.id,
        kind: leadsTable.kind,
        gymId: leadsTable.gymId,
        gymName: leadsTable.gymName,
        name: leadsTable.name,
        phone: leadsTable.phone,
        email: leadsTable.email,
        city: leadsTable.city,
        message: leadsTable.message,
        status: leadsTable.status,
        source: leadsTable.source,
        assignedTo: leadsTable.assignedTo,
        createdAt: leadsTable.createdAt,
      })
      .from(leadsTable)
      .where(inArray(leadsTable.gymId, gymIds))
      .orderBy(desc(leadsTable.createdAt))
      .limit(5000);
    res.json(rows);
  },
);

// Branch owners can update the status of leads for their own branches so the
// CRM reflects reality without waiting for the admin. Scoped by ownedGymIds;
// staff access is gated to the "bookings" permission via the router-level
// STAFF_PERMISSION_PREFIXES guard ("/partner/leads" prefix).
const PARTNER_LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "lost",
] as const;

router.patch(
  "/partner/leads/:id",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }
    const { status } = (req.body ?? {}) as { status?: string };
    if (
      !status ||
      !(PARTNER_LEAD_STATUSES as readonly string[]).includes(status)
    ) {
      res.status(400).json({
        error: `Status must be one of: ${PARTNER_LEAD_STATUSES.join(", ")}`,
      });
      return;
    }
    const gymIds = await ownedGymIds(req.session.partnerId!);
    if (gymIds.length === 0) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    const [updated] = await db
      .update(leadsTable)
      .set({ status })
      .where(and(eq(leadsTable.id, id), inArray(leadsTable.gymId, gymIds)))
      .returning({ id: leadsTable.id, status: leadsTable.status });
    if (!updated) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    res.json(updated);
  },
);

// Member complaints for the partner's branches. Every read/write is scoped by
// ownedGymIds so a branch owner can never see another brand's complaints;
// staff access is gated to "bookings" via STAFF_PERMISSION_PREFIXES.
const PARTNER_COMPLAINT_STATUSES = [
  "open",
  "in_progress",
  "resolved",
] as const;

router.get(
  "/partner/complaints",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const gymIds = await ownedGymIds(req.session.partnerId!);
    if (gymIds.length === 0) {
      res.json([]);
      return;
    }
    const rows = await db
      .select()
      .from(complaintsTable)
      .where(inArray(complaintsTable.gymId, gymIds))
      .orderBy(desc(complaintsTable.createdAt))
      .limit(5000);
    res.json(rows);
  },
);

router.patch(
  "/partner/complaints/:id",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid complaint id" });
      return;
    }
    const { status, response } = (req.body ?? {}) as {
      status?: string;
      response?: string;
    };
    const patch: Partial<typeof complaintsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (status !== undefined) {
      if (
        !(PARTNER_COMPLAINT_STATUSES as readonly string[]).includes(status)
      ) {
        res.status(400).json({
          error: `Status must be one of: ${PARTNER_COMPLAINT_STATUSES.join(", ")}`,
        });
        return;
      }
      patch.status = status;
    }
    if (response !== undefined) {
      if (typeof response !== "string" || response.length > 2000) {
        res.status(400).json({ error: "Invalid response" });
        return;
      }
      patch.response = response.trim();
    }
    const gymIds = await ownedGymIds(req.session.partnerId!);
    if (gymIds.length === 0) {
      res.status(404).json({ error: "Complaint not found" });
      return;
    }
    // Read the row first (with the same ownership scope) so the member is
    // only pinged on an actual change, not on every re-save.
    const [before] = await db
      .select()
      .from(complaintsTable)
      .where(
        and(
          eq(complaintsTable.id, id),
          inArray(complaintsTable.gymId, gymIds),
        ),
      );
    if (!before) {
      res.status(404).json({ error: "Complaint not found" });
      return;
    }
    const [updated] = await db
      .update(complaintsTable)
      .set(patch)
      .where(
        and(
          eq(complaintsTable.id, id),
          inArray(complaintsTable.gymId, gymIds),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Complaint not found" });
      return;
    }
    void notifyMemberOfComplaintUpdate(before, updated);
    res.json(updated);
  },
);

// Paid personal-training session bookings for the partner's branches.
router.get(
  "/partner/trainer-bookings",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const gymIds = await ownedGymIds(req.session.partnerId!);
    if (gymIds.length === 0) {
      res.json([]);
      return;
    }
    const rows = await db
      .select({
        id: trainerBookingsTable.id,
        gymId: trainerBookingsTable.gymId,
        gymName: trainerBookingsTable.gymName,
        branchId: trainerBookingsTable.branchId,
        trainerName: trainerBookingsTable.trainerName,
        memberName: trainerBookingsTable.memberName,
        mobile: trainerBookingsTable.mobile,
        packageName: trainerBookingsTable.packageName,
        serviceName: trainerBookingsTable.serviceName,
        amountInr: trainerBookingsTable.amountInr,
        preferredDate: trainerBookingsTable.preferredDate,
        status: trainerBookingsTable.status,
        createdAt: trainerBookingsTable.createdAt,
      })
      .from(trainerBookingsTable)
      .where(inArray(trainerBookingsTable.gymId, gymIds))
      .orderBy(desc(trainerBookingsTable.createdAt))
      .limit(2000);
    const enquiries = await fetchTrainerEnquiryRows(gymIds);
    const [bookingAssign, enquiryAssign] = await Promise.all([
      fetchPtAssignmentMap(
        "booking",
        rows.map((r) => r.id),
      ),
      fetchPtAssignmentMap(
        "enquiry",
        enquiries.map((r) => -r.id),
      ),
    ]);
    const merged = [
      ...rows.map((r) => ({
        ...r,
        assignedTrainerName: bookingAssign.get(r.id)?.trainerName ?? "",
      })),
      ...enquiries.map((r) => ({
        ...r,
        assignedTrainerName: enquiryAssign.get(-r.id)?.trainerName ?? "",
      })),
    ].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    res.json(merged);
  },
);

// Assign (or reassign) a trainer to a PT booking or enquiry the partner owns.
// Merged-list ids: positive = trainer_bookings row, negative = enquiry lead.
// Staff access: also gated to the "classes" permission by the router-level
// STAFF_PERMISSION_PREFIXES guard; the explicit gate below is belt-and-braces.
router.put(
  "/partner/trainer-bookings/:id/assign",
  requirePartner,
  requirePartnerPerm("classes"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const trainerId = String(req.body?.trainerId ?? "").trim();
    const trainerName = String(req.body?.trainerName ?? "").trim();
    if (!Number.isFinite(id) || id === 0 || !trainerName || trainerName.length > 120) {
      res.status(400).json({ error: "Valid id and trainer name required" });
      return;
    }
    const gymIds = await ownedGymIds(req.session.partnerId!);
    const gymId = await ptAssignTargetGymId(id);
    if (gymId === null) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (!gymIds.includes(gymId)) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }
    await upsertPtAssignment(
      id > 0 ? "booking" : "enquiry",
      Math.abs(id),
      trainerId,
      trainerName,
    );
    res.json({ ok: true });
  },
);

// ─── PT session scheduling (partner, owned branches only) ───
// Merged-list ids: positive = trainer_bookings row, negative = enquiry lead.

/** Resolve + authorize a merged id for the signed-in partner. */
async function ptSessionAccess(
  req: Request,
  res: Response,
): Promise<{ refType: "booking" | "enquiry"; refId: number } | null> {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id === 0) {
    res.status(400).json({ error: "Invalid id" });
    return null;
  }
  const gymIds = await ownedGymIds(req.session.partnerId!);
  const gymId = await ptAssignTargetGymId(id);
  if (gymId === null) {
    res.status(404).json({ error: "Booking not found" });
    return null;
  }
  if (!gymIds.includes(gymId)) {
    res.status(403).json({ error: "Not allowed" });
    return null;
  }
  return { refType: id > 0 ? "booking" : "enquiry", refId: Math.abs(id) };
}

router.get(
  "/partner/trainer-bookings/:id/sessions",
  requirePartner,
  requirePartnerPerm("classes"),
  async (req: Request, res: Response): Promise<void> => {
    const ref = await ptSessionAccess(req, res);
    if (!ref) return;
    res.json(await listPtSessions(ref.refType, ref.refId));
  },
);

router.post(
  "/partner/trainer-bookings/:id/sessions",
  requirePartner,
  requirePartnerPerm("classes"),
  async (req: Request, res: Response): Promise<void> => {
    const date = String(req.body?.date ?? "").trim();
    const time = String(req.body?.time ?? "").trim();
    if (!validPtSessionInput(date, time)) {
      res.status(400).json({ error: "Valid date (YYYY-MM-DD) and time (HH:MM) required" });
      return;
    }
    const ref = await ptSessionAccess(req, res);
    if (!ref) return;
    res.json(await addPtSession(ref.refType, ref.refId, date, time));
  },
);

router.patch(
  "/partner/trainer-bookings/:id/sessions/:sessionId",
  requirePartner,
  requirePartnerPerm("classes"),
  async (req: Request, res: Response): Promise<void> => {
    const sessionId = Number(req.params.sessionId);
    const status = String(req.body?.status ?? "");
    if (
      !Number.isFinite(sessionId) ||
      !["scheduled", "completed", "cancelled"].includes(status)
    ) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const ref = await ptSessionAccess(req, res);
    if (!ref) return;
    const ok = await setPtSessionStatus(
      ref.refType,
      ref.refId,
      sessionId,
      status as "scheduled" | "completed" | "cancelled",
    );
    if (!ok) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ ok: true });
  },
);

router.delete(
  "/partner/trainer-bookings/:id/sessions/:sessionId",
  requirePartner,
  requirePartnerPerm("classes"),
  async (req: Request, res: Response): Promise<void> => {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isFinite(sessionId)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const ref = await ptSessionAccess(req, res);
    if (!ref) return;
    const ok = await deletePtSession(ref.refType, ref.refId, sessionId);
    if (!ok) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ ok: true });
  },
);

// Paid membership-package purchases for the partner's branches.
router.get(
  "/partner/package-bookings",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const gymIds = await ownedGymIds(req.session.partnerId!);
    if (gymIds.length === 0) {
      res.json([]);
      return;
    }
    const rows = await db
      .select({
        id: packageBookingsTable.id,
        gymId: packageBookingsTable.gymId,
        gymName: packageBookingsTable.gymName,
        memberName: packageBookingsTable.memberName,
        mobile: packageBookingsTable.mobile,
        packageName: packageBookingsTable.packageName,
        serviceName: packageBookingsTable.serviceName,
        amountInr: packageBookingsTable.amountInr,
        startDate: packageBookingsTable.startDate,
        status: packageBookingsTable.status,
        createdAt: packageBookingsTable.createdAt,
      })
      .from(packageBookingsTable)
      .where(inArray(packageBookingsTable.gymId, gymIds))
      .orderBy(desc(packageBookingsTable.createdAt))
      .limit(2000);
    res.json(rows);
  },
);

// Attendees for a single class (partner must own the class's gym).
router.get(
  "/partner/classes/:id/attendees",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const partnerId = req.session.partnerId!;
    const id = Number(req.params.id);
    const [cls] = await db
      .select()
      .from(classSessionsTable)
      .where(eq(classSessionsTable.id, id));
    if (!cls) {
      res.status(404).json({ error: "Class not found" });
      return;
    }
    if (!(await ensureOwnsGym(partnerId, cls.gymId))) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }
    const rows = await db
      .select({
        id: bookingsTable.id,
        status: bookingsTable.status,
        createdAt: bookingsTable.createdAt,
        userId: usersTable.id,
        userName: usersTable.name,
        userEmail: usersTable.email,
        userPhone: usersTable.mobile,
        userAvatar: usersTable.avatarUrl,
      })
      .from(bookingsTable)
      .innerJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
      .where(eq(bookingsTable.classId, id))
      .orderBy(desc(bookingsTable.createdAt));
    res.json(rows);
  },
);

// Partner updates a booking status (confirmed / completed / cancelled).
router.patch(
  "/partner/bookings/:id",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const partnerId = req.session.partnerId!;
    const id = Number(req.params.id);
    const status = String((req.body ?? {}).status ?? "");
    if (!["confirmed", "completed", "cancelled"].includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    const [booking] = await db
      .select({
        id: bookingsTable.id,
        classId: bookingsTable.classId,
        currentStatus: bookingsTable.status,
        gymId: classSessionsTable.gymId,
        capacity: classSessionsTable.capacity,
      })
      .from(bookingsTable)
      .innerJoin(
        classSessionsTable,
        eq(bookingsTable.classId, classSessionsTable.id),
      )
      .where(eq(bookingsTable.id, id));
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (!(await ensureOwnsGym(partnerId, booking.gymId))) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }
    // Block over-booking when moving back into an active state.
    const wasActive = booking.currentStatus !== "cancelled";
    const willBeActive = status !== "cancelled";
    if (!wasActive && willBeActive) {
      const [count] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(bookingsTable)
        .where(
          and(
            eq(bookingsTable.classId, booking.classId),
            sql`${bookingsTable.status} <> 'cancelled'`,
          ),
        );
      if ((count?.c ?? 0) >= booking.capacity) {
        res
          .status(409)
          .json({ error: "Class is full — cannot restore this booking." });
        return;
      }
    }
    const [updated] = await db
      .update(bookingsTable)
      .set({ status })
      .where(eq(bookingsTable.id, id))
      .returning();
    res.json(updated);
  },
);

// ─── Trainers (read-only list scoped to partner's gyms) ───────────────────

router.get(
  "/partner/trainers",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const gymIds = await ownedGymIds(req.session.partnerId!);
    if (gymIds.length === 0) {
      res.json([]);
      return;
    }
    const rows = await db
      .select({
        id: trainersTable.id,
        name: trainersTable.name,
        specialty: trainersTable.specialty,
        bio: trainersTable.bio,
        photoUrl: trainersTable.photoUrl,
        gymId: trainersTable.gymId,
      })
      .from(trainersTable)
      .where(inArray(trainersTable.gymId, gymIds));
    res.json(rows);
  },
);

const DEFAULT_TRAINER_PHOTO =
  "https://images.unsplash.com/photo-1567013127542-490d757e51fc?w=400";

function trainerDto(t: typeof trainersTable.$inferSelect) {
  return {
    id: t.id,
    name: t.name,
    specialty: t.specialty,
    bio: t.bio,
    photoUrl: t.photoUrl,
    gymId: t.gymId,
  };
}

// Create a trainer attached to one of the partner's own gyms.
router.post(
  "/partner/trainers",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const gymId = Number(b.gymId);
    if (!b.name || !b.specialty || !gymId) {
      res.status(400).json({ error: "name, specialty and gym are required" });
      return;
    }
    if (!(await ensureOwnsGym(req.session.partnerId!, gymId))) {
      res.status(403).json({ error: "You do not manage this gym" });
      return;
    }
    const [gym] = await db
      .select({ city: gymsTable.city })
      .from(gymsTable)
      .where(eq(gymsTable.id, gymId));
    const [created] = await db
      .insert(trainersTable)
      .values({
        name: String(b.name),
        specialty: String(b.specialty),
        bio: String(b.bio ?? ""),
        photoUrl: String(b.photoUrl || DEFAULT_TRAINER_PHOTO),
        rating: 4.7,
        sessionsCount: 0,
        pricePerSession: Number(b.pricePerSession ?? 1500),
        certifications: [],
        city: gym?.city ?? "",
        gymId,
      })
      .returning();
    res.status(201).json(trainerDto(created));
  },
);

// Update a trainer the partner owns (optionally moving it to another owned gym).
router.patch(
  "/partner/trainers/:id",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(trainersTable)
      .where(eq(trainersTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Trainer not found" });
      return;
    }
    if (
      !existing.gymId ||
      !(await ensureOwnsGym(req.session.partnerId!, existing.gymId))
    ) {
      res.status(403).json({ error: "You do not manage this trainer" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "specialty", "bio", "photoUrl"]) {
      if (b[k] !== undefined) patch[k] = String(b[k]);
    }
    if (b.gymId !== undefined) {
      const newGymId = Number(b.gymId);
      if (!(await ensureOwnsGym(req.session.partnerId!, newGymId))) {
        res.status(403).json({ error: "You do not manage the target gym" });
        return;
      }
      patch.gymId = newGymId;
    }
    const [updated] = await db
      .update(trainersTable)
      .set(patch)
      .where(eq(trainersTable.id, id))
      .returning();
    res.json(trainerDto(updated));
  },
);

// Delete a trainer the partner owns.
router.delete(
  "/partner/trainers/:id",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(trainersTable)
      .where(eq(trainersTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Trainer not found" });
      return;
    }
    if (
      !existing.gymId ||
      !(await ensureOwnsGym(req.session.partnerId!, existing.gymId))
    ) {
      res.status(403).json({ error: "You do not manage this trainer" });
      return;
    }
    await db.delete(trainersTable).where(eq(trainersTable.id, id));
    res.json({ ok: true });
  },
);

// ─── Weekly group-class (GX) timetable (partner-scoped) ───────────────────
//
// Every branch shows the shared default template until a partner customises
// it. The first time a partner opens their schedule editor we materialise the
// default rows for that gym so they have concrete, editable entries.

function scheduleDto(r: typeof groupClassScheduleTable.$inferSelect) {
  return {
    id: r.id,
    gymId: r.gymId,
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    endTime: r.endTime,
    className: r.className,
    sortOrder: r.sortOrder,
  };
}

async function ensureScheduleRows(gymId: number): Promise<void> {
  // Serialise first-time materialisation per gym so two concurrent first-loads
  // can't both pass the existence check and double-insert the default rows.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${gymId})`);
    const existing = await tx
      .select({ id: groupClassScheduleTable.id })
      .from(groupClassScheduleTable)
      .where(eq(groupClassScheduleTable.gymId, gymId))
      .limit(1);
    if (existing.length > 0) return;
    await tx.insert(groupClassScheduleTable).values(
      DEFAULT_GROUP_CLASS_SCHEDULE.map((e) => ({
        gymId,
        dayOfWeek: e.dayOfWeek,
        startTime: e.startTime,
        endTime: e.endTime,
        className: e.className,
        sortOrder: e.sortOrder,
      })),
    );
  });
}

async function listScheduleRows(gymId: number) {
  const rows = await db
    .select()
    .from(groupClassScheduleTable)
    .where(eq(groupClassScheduleTable.gymId, gymId))
    .orderBy(
      asc(groupClassScheduleTable.dayOfWeek),
      asc(groupClassScheduleTable.sortOrder),
    );
  return rows.map(scheduleDto);
}

// List the schedule for one of the partner's gyms (defaults to the first owned
// gym when no gymId is given). Materialises default rows on first read.
router.get(
  "/partner/schedule",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const gymIds = await ownedGymIds(req.session.partnerId!);
    if (gymIds.length === 0) {
      res.json([]);
      return;
    }
    let gymId = Number(req.query.gymId);
    if (!gymId) gymId = gymIds[0];
    if (!gymIds.includes(gymId)) {
      res.status(403).json({ error: "You do not manage this gym" });
      return;
    }
    await ensureScheduleRows(gymId);
    res.json(await listScheduleRows(gymId));
  },
);

// Add a new class slot to one of the partner's gyms.
router.post(
  "/partner/schedule",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const gymId = Number(b.gymId);
    const dayOfWeek = Number(b.dayOfWeek);
    if (
      !gymId ||
      !dayOfWeek ||
      dayOfWeek < 1 ||
      dayOfWeek > 7 ||
      !b.startTime ||
      !b.endTime ||
      !b.className
    ) {
      res.status(400).json({
        error:
          "gymId, dayOfWeek (1-7), startTime, endTime and className are required",
      });
      return;
    }
    if (!(await ensureOwnsGym(req.session.partnerId!, gymId))) {
      res.status(403).json({ error: "You do not manage this gym" });
      return;
    }
    const [created] = await db
      .insert(groupClassScheduleTable)
      .values({
        gymId,
        dayOfWeek,
        startTime: String(b.startTime),
        endTime: String(b.endTime),
        className: String(b.className),
        sortOrder: Number(b.sortOrder ?? 0),
      })
      .returning();
    res.status(201).json(scheduleDto(created));
  },
);

// Update a class slot the partner owns.
router.patch(
  "/partner/schedule/:id",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(groupClassScheduleTable)
      .where(eq(groupClassScheduleTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Class slot not found" });
      return;
    }
    if (!(await ensureOwnsGym(req.session.partnerId!, existing.gymId))) {
      res.status(403).json({ error: "You do not manage this gym" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (b.dayOfWeek !== undefined) {
      const d = Number(b.dayOfWeek);
      if (d >= 1 && d <= 7) patch.dayOfWeek = d;
    }
    for (const k of ["startTime", "endTime", "className"]) {
      if (b[k] !== undefined) patch[k] = String(b[k]);
    }
    if (b.sortOrder !== undefined) patch.sortOrder = Number(b.sortOrder);
    if (Object.keys(patch).length === 0) {
      res.json(scheduleDto(existing));
      return;
    }
    const [updated] = await db
      .update(groupClassScheduleTable)
      .set(patch)
      .where(eq(groupClassScheduleTable.id, id))
      .returning();
    res.json(scheduleDto(updated));
  },
);

// Delete a class slot the partner owns.
router.delete(
  "/partner/schedule/:id",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(groupClassScheduleTable)
      .where(eq(groupClassScheduleTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Class slot not found" });
      return;
    }
    if (!(await ensureOwnsGym(req.session.partnerId!, existing.gymId))) {
      res.status(403).json({ error: "You do not manage this gym" });
      return;
    }
    await db
      .delete(groupClassScheduleTable)
      .where(eq(groupClassScheduleTable.id, id));
    res.json({ ok: true });
  },
);

// Reset a gym's timetable back to the shared default template.
router.post(
  "/partner/schedule/reset",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const gymId = Number(req.query.gymId ?? b.gymId);
    if (!gymId || !(await ensureOwnsGym(req.session.partnerId!, gymId))) {
      res.status(403).json({ error: "You do not manage this gym" });
      return;
    }
    await db
      .delete(groupClassScheduleTable)
      .where(eq(groupClassScheduleTable.gymId, gymId));
    await ensureScheduleRows(gymId);
    res.json(await listScheduleRows(gymId));
  },
);

// ─── Class session CRUD (partner-scoped) ──────────────────────────────────

async function ensureOwnsGym(
  partnerId: number,
  gymId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: gymsTable.id })
    .from(gymsTable)
    .where(
      and(eq(gymsTable.id, gymId), eq(gymsTable.ownerPartnerId, partnerId)),
    );
  return !!row;
}

async function trainerBelongsToGym(
  trainerId: number,
  gymId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: trainersTable.id })
    .from(trainersTable)
    .where(
      and(eq(trainersTable.id, trainerId), eq(trainersTable.gymId, gymId)),
    );
  return !!row;
}

router.post(
  "/partner/classes",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const partnerId = req.session.partnerId!;
    const b = (req.body ?? {}) as Record<string, any>;
    const gymId = Number(b.gymId);
    const trainerId = Number(b.trainerId);
    if (!b.title || !b.category || !gymId || !trainerId || !b.startsAt) {
      res.status(400).json({
        error: "title, category, gymId, trainerId, startsAt required",
      });
      return;
    }
    if (!(await ensureOwnsGym(partnerId, gymId))) {
      res.status(403).json({ error: "You don't own this gym" });
      return;
    }
    if (!(await trainerBelongsToGym(trainerId, gymId))) {
      res.status(400).json({
        error: "That trainer isn't attached to this gym.",
      });
      return;
    }
    const [row] = await db
      .insert(classSessionsTable)
      .values({
        title: String(b.title),
        category: String(b.category),
        gymId,
        trainerId,
        startsAt: new Date(String(b.startsAt)),
        durationMin: Number(b.durationMin ?? 60),
        capacity: Number(b.capacity ?? 20),
        intensity: String(b.intensity ?? "medium"),
        coverImage: String(b.coverImage ?? ""),
        description: String(b.description ?? ""),
        equipmentNeeded: Array.isArray(b.equipmentNeeded)
          ? b.equipmentNeeded.map(String)
          : [],
        calorieEstimate: Number(b.calorieEstimate ?? 0),
      })
      .returning();
    res.json(row);
  },
);

router.patch(
  "/partner/classes/:id",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const partnerId = req.session.partnerId!;
    const id = Number(req.params.id);
    const b = (req.body ?? {}) as Record<string, any>;
    const [existing] = await db
      .select()
      .from(classSessionsTable)
      .where(eq(classSessionsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Class not found" });
      return;
    }
    if (!(await ensureOwnsGym(partnerId, existing.gymId))) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }
    const patch: Record<string, unknown> = {};
    for (const k of [
      "title",
      "category",
      "intensity",
      "coverImage",
      "description",
    ]) {
      if (b[k] !== undefined) patch[k] = String(b[k]);
    }
    for (const k of ["durationMin", "capacity", "calorieEstimate"]) {
      if (b[k] !== undefined) patch[k] = Number(b[k]);
    }
    if (b.startsAt !== undefined) patch.startsAt = new Date(String(b.startsAt));
    let effectiveGymId = existing.gymId;
    if (b.gymId !== undefined) {
      const newGymId = Number(b.gymId);
      if (!(await ensureOwnsGym(partnerId, newGymId))) {
        res.status(403).json({ error: "You don't own the target gym" });
        return;
      }
      patch.gymId = newGymId;
      effectiveGymId = newGymId;
    }
    if (b.trainerId !== undefined) {
      const newTrainerId = Number(b.trainerId);
      if (!(await trainerBelongsToGym(newTrainerId, effectiveGymId))) {
        res.status(400).json({
          error: "That trainer isn't attached to this gym.",
        });
        return;
      }
      patch.trainerId = newTrainerId;
    }
    if (Array.isArray(b.equipmentNeeded)) {
      patch.equipmentNeeded = b.equipmentNeeded.map(String);
    }
    const [row] = await db
      .update(classSessionsTable)
      .set(patch)
      .where(eq(classSessionsTable.id, id))
      .returning();
    res.json(row);
  },
);

router.delete(
  "/partner/classes/:id",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const partnerId = req.session.partnerId!;
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(classSessionsTable)
      .where(eq(classSessionsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Class not found" });
      return;
    }
    if (!(await ensureOwnsGym(partnerId, existing.gymId))) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }
    await db
      .delete(classSessionsTable)
      .where(eq(classSessionsTable.id, id));
    res.json({ ok: true });
  },
);

// ─── Partner products (multi-vendor) ───

function slugifyP(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

router.get(
  "/partner/products",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const partnerId = req.session.partnerId!;
    const rows = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.vendorPartnerId, partnerId))
      .orderBy(desc(productsTable.id));
    res.json(rows);
  },
);

router.post(
  "/partner/products",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const partnerId = req.session.partnerId!;
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.name || !b.priceInr || !b.imageUrl) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    const slug = b.slug
      ? slugifyP(String(b.slug))
      : `${slugifyP(String(b.name))}-${Date.now().toString(36)}`;
    const [row] = await db
      .insert(productsTable)
      .values({
        vendorPartnerId: partnerId, // always self — vendor scope is enforced server-side
        name: String(b.name),
        slug,
        description: String(b.description ?? ""),
        category: String(b.category ?? "apparel"),
        priceInr: Number(b.priceInr),
        originalPriceInr: Number(b.originalPriceInr ?? b.priceInr),
        imageUrl: String(b.imageUrl),
        gallery: Array.isArray(b.gallery) ? b.gallery.map(String) : [],
        sizes: Array.isArray(b.sizes) ? b.sizes.map(String) : [],
        colors: Array.isArray(b.colors) ? b.colors.map(String) : [],
        stock: Number(b.stock ?? 0),
        status: String(b.status ?? "active"),
      })
      .returning();
    res.json(row);
  },
);

router.patch(
  "/partner/products/:id",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const partnerId = req.session.partnerId!;
    const id = Number(req.params.id);
    const b = (req.body ?? {}) as Record<string, any>;
    const patch: Record<string, unknown> = {};
    if (b.name !== undefined) patch.name = String(b.name);
    if (b.description !== undefined) patch.description = String(b.description);
    if (b.category !== undefined) patch.category = String(b.category);
    if (b.priceInr !== undefined) patch.priceInr = Number(b.priceInr);
    if (b.originalPriceInr !== undefined)
      patch.originalPriceInr = Number(b.originalPriceInr);
    if (b.imageUrl !== undefined) patch.imageUrl = String(b.imageUrl);
    if (Array.isArray(b.gallery)) patch.gallery = b.gallery.map(String);
    if (Array.isArray(b.sizes)) patch.sizes = b.sizes.map(String);
    if (Array.isArray(b.colors)) patch.colors = b.colors.map(String);
    if (b.stock !== undefined) patch.stock = Number(b.stock);
    if (b.status !== undefined) patch.status = String(b.status);
    // vendorPartnerId is NOT patchable — locks ownership to the authenticated partner.
    const [row] = await db
      .update(productsTable)
      .set(patch)
      .where(
        and(
          eq(productsTable.id, id),
          eq(productsTable.vendorPartnerId, partnerId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(row);
  },
);

router.delete(
  "/partner/products/:id",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const partnerId = req.session.partnerId!;
    const id = Number(req.params.id);
    const deleted = await db
      .delete(productsTable)
      .where(
        and(
          eq(productsTable.id, id),
          eq(productsTable.vendorPartnerId, partnerId),
        ),
      )
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json({ ok: true });
  },
);

router.get(
  "/partner/orders",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const partnerId = req.session.partnerId!;
    const myItems = await db
      .select()
      .from(productOrderItemsTable)
      .where(eq(productOrderItemsTable.vendorPartnerId, partnerId));
    if (myItems.length === 0) {
      res.json([]);
      return;
    }
    const orderIds = Array.from(new Set(myItems.map((i) => i.orderId)));
    const orders = await db
      .select()
      .from(productOrdersTable)
      .where(inArray(productOrdersTable.id, orderIds))
      .orderBy(desc(productOrdersTable.id));
    const byOrder = new Map<number, typeof myItems>();
    for (const it of myItems) {
      const list = byOrder.get(it.orderId) ?? [];
      list.push(it);
      byOrder.set(it.orderId, list);
    }
    // Only return this vendor's items (not other vendors' items in the same order).
    // `vendorStatus` reflects this vendor's own fulfillment progress, derived
    // from their items (the vendor PATCH sets all their items together, so they
    // are uniform — "mixed" only appears for legacy/partial data).
    res.json(
      orders.map((o) => {
        const its = byOrder.get(o.id) ?? [];
        const statuses = Array.from(new Set(its.map((i) => i.status)));
        const vendorStatus =
          statuses.length === 1 ? statuses[0] : statuses.length === 0 ? "placed" : "mixed";
        return { ...o, items: its, vendorStatus };
      }),
    );
  },
);

const VENDOR_ORDER_STATUSES = new Set([
  "placed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]);

// A vendor updates the fulfillment status of *their own* items within an order.
// Other vendors' items in the same (multi-vendor) order are untouched.
router.patch(
  "/partner/orders/:id",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const partnerId = req.session.partnerId!;
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const status = String((req.body ?? {}).status ?? "");
    if (!VENDOR_ORDER_STATUSES.has(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    // Race-safe transition: only update rows whose status actually differs,
    // so of N concurrent identical saves only the one that changes rows
    // notifies the member (re-saving the same status is a no-op).
    const changedRows = await db
      .update(productOrderItemsTable)
      .set({ status })
      .where(
        and(
          eq(productOrderItemsTable.orderId, orderId),
          eq(productOrderItemsTable.vendorPartnerId, partnerId),
          ne(productOrderItemsTable.status, status),
        ),
      )
      .returning();
    // Full current item list for the response (and 404 detection).
    const items = await db
      .select()
      .from(productOrderItemsTable)
      .where(
        and(
          eq(productOrderItemsTable.orderId, orderId),
          eq(productOrderItemsTable.vendorPartnerId, partnerId),
        ),
      );
    if (items.length === 0) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    // Fire-and-forget member notification — only when rows actually changed.
    if (changedRows.length > 0) {
      const [parent] = await db
        .select({ userId: productOrdersTable.userId })
        .from(productOrdersTable)
        .where(eq(productOrdersTable.id, orderId));
      if (parent) void notifyOrderStatus(parent.userId, orderId, status);
    }
    res.json({ ok: true, status, items });
  },
);

// Store dashboard metrics for the authenticated vendor: catalog health plus
// gross sales, platform commission, and net payout.
router.get(
  "/partner/store-stats",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const partnerId = req.session.partnerId!;
    const products = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.vendorPartnerId, partnerId));
    const productCount = products.length;
    const activeProducts = products.filter((p) => p.status === "active").length;
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 5).length;
    const outOfStock = products.filter((p) => p.stock <= 0).length;

    const myItems = await db
      .select()
      .from(productOrderItemsTable)
      .where(eq(productOrderItemsTable.vendorPartnerId, partnerId));
    const orderCount = new Set(myItems.map((i) => i.orderId)).size;
    // Gross excludes cancelled items so payout reflects fulfillable revenue.
    const grossInr = myItems
      .filter((i) => i.status !== "cancelled")
      .reduce((sum, i) => sum + i.unitPriceInr * i.qty, 0);

    const [partner] = await db
      .select({ commissionPct: partnersTable.commissionPct })
      .from(partnersTable)
      .where(eq(partnersTable.id, partnerId));
    const commissionPct = partner?.commissionPct ?? 10;
    const commissionInr = Math.round((grossInr * commissionPct) / 100);
    const netInr = grossInr - commissionInr;

    res.json({
      productCount,
      activeProducts,
      lowStock,
      outOfStock,
      orderCount,
      grossInr,
      commissionPct,
      commissionInr,
      netInr,
    });
  },
);

router.get(
  "/partner/documents",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const docs = await db
      .select()
      .from(partnerDocumentsTable)
      .where(eq(partnerDocumentsTable.partnerId, req.session.partnerId!))
      .orderBy(desc(partnerDocumentsTable.uploadedAt));
    res.json(docs);
  },
);

router.post(
  "/partner/documents",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const { name, url, notes } = (req.body ?? {}) as {
      name?: string;
      url?: string;
      notes?: string;
    };
    if (!name || !url) {
      res.status(400).json({ error: "Document name and file required" });
      return;
    }
    const [created] = await db
      .insert(partnerDocumentsTable)
      .values({
        partnerId: req.session.partnerId!,
        name,
        url,
        notes: notes ?? "",
        uploadedByKind: "partner",
        uploadedByEmail: req.session.partnerEmail ?? "",
      })
      .returning();
    res.status(201).json(created);
  },
);

router.delete(
  "/partner/documents/:id",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db
      .delete(partnerDocumentsTable)
      .where(
        and(
          eq(partnerDocumentsTable.id, id),
          eq(partnerDocumentsTable.partnerId, req.session.partnerId!),
        ),
      );
    res.json({ ok: true });
  },
);

// ─── YoActiv member directory (partner's own branches only) ─────────────────

// YoActiv branch IDs mapped to gyms this partner owns. Every route below is
// scoped to this set, so a partner can never read another brand's members.
async function ownedYoactivBranches(
  partnerId: number,
): Promise<{ branchId: number; gymLabel: string }[]> {
  const rows = await db
    .select({
      name: gymsTable.name,
      area: gymsTable.area,
      yoactivBranchId: gymsTable.yoactivBranchId,
    })
    .from(gymsTable)
    .where(eq(gymsTable.ownerPartnerId, partnerId));
  const seen = new Set<number>();
  const out: { branchId: number; gymLabel: string }[] = [];
  for (const r of rows) {
    if (r.yoactivBranchId && !seen.has(r.yoactivBranchId)) {
      seen.add(r.yoactivBranchId);
      out.push({
        branchId: r.yoactivBranchId,
        gymLabel: `${r.name} (${r.area})`,
      });
    }
  }
  return out;
}

router.get(
  "/partner/yoactiv/branches",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    if (!yoactivConfigured()) {
      res.json([]);
      return;
    }
    const branches = await ownedYoactivBranches(req.session.partnerId!);
    res.json(
      branches.map((b) => ({
        branchId: b.branchId,
        branchName: yoactivBranchName(b.branchId),
        gymLabel: b.gymLabel,
      })),
    );
  },
);

router.get(
  "/partner/yoactiv/members",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const branchId = Number(req.query.branchId);
    if (!Number.isFinite(branchId) || branchId <= 0) {
      res.status(400).json({ error: "branchId required" });
      return;
    }
    const branches = await ownedYoactivBranches(req.session.partnerId!);
    if (!branches.some((b) => b.branchId === branchId)) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }
    if (!yoactivConfigured()) {
      res.json([]);
      return;
    }
    const members = await fetchYoactivMemberList(branchId);
    // Member photos come straight from YoActiv (display-only, no uploads).
    res.json(members);
  },
);

// PT trainer roster for one owned branch (name + mobile — the partner's own
// staff). Unowned branches are refused, same as the member list.
router.get(
  "/partner/yoactiv/trainers",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const branchId = Number(req.query.branchId);
    if (!Number.isFinite(branchId) || branchId <= 0) {
      res.status(400).json({ error: "branchId required" });
      return;
    }
    const branches = await ownedYoactivBranches(req.session.partnerId!);
    if (!branches.some((b) => b.branchId === branchId)) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }
    if (!yoactivConfigured()) {
      res.json([]);
      return;
    }
    const trainers = await fetchYoactivBranchTrainers(branchId);
    const photos = await trainerPhotoMap(trainers.map((t) => t.id));
    res.json(
      trainers.map((t) => ({ ...t, photoUrl: photos.get(t.id) ?? null })),
    );
  },
);

// A partner may only set/remove a photo for a trainer that appears in the
// roster of one of their OWN branches — never another brand's staff.
async function partnerOwnsTrainer(
  partnerId: number,
  branchId: number,
  trainerId: string,
): Promise<boolean> {
  const branches = await ownedYoactivBranches(partnerId);
  if (!branches.some((b) => b.branchId === branchId)) return false;
  const roster = await fetchYoactivBranchTrainers(branchId);
  return roster.some((t) => t.id === trainerId);
}

router.put(
  "/partner/yoactiv/trainers/:trainerId/photo",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const trainerId = String(req.params.trainerId ?? "").trim();
    const branchId = Number(req.body?.branchId);
    const imageUrl = String(req.body?.imageUrl ?? "").trim();
    if (!trainerId || !Number.isFinite(branchId) || branchId <= 0) {
      res.status(400).json({ error: "trainerId and branchId required" });
      return;
    }
    if (!/^(https?:\/\/|\/)/.test(imageUrl)) {
      res.status(400).json({ error: "Upload an image or provide a valid image URL" });
      return;
    }
    if (!(await partnerOwnsTrainer(req.session.partnerId!, branchId, trainerId))) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }
    await setTrainerPhoto(trainerId, imageUrl);
    res.json({ ok: true });
  },
);

router.delete(
  "/partner/yoactiv/trainers/:trainerId/photo",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const trainerId = String(req.params.trainerId ?? "").trim();
    const branchId = Number(req.query.branchId);
    if (!trainerId || !Number.isFinite(branchId) || branchId <= 0) {
      res.status(400).json({ error: "trainerId and branchId required" });
      return;
    }
    if (!(await partnerOwnsTrainer(req.session.partnerId!, branchId, trainerId))) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }
    await removeTrainerPhoto(trainerId);
    res.json({ ok: true });
  },
);

// Plan details for one member — memberships are filtered down to the
// partner's own branches so cross-brand plan history is never exposed.
router.get(
  "/partner/yoactiv/members/detail",
  requirePartner,
  async (req: Request, res: Response): Promise<void> => {
    const mobile = String(req.query.mobile ?? "").trim();
    if (!mobile) {
      res.status(400).json({ error: "mobile required" });
      return;
    }
    const branches = await ownedYoactivBranches(req.session.partnerId!);
    const ownedBranchIds = new Set(branches.map((b) => b.branchId));
    if (ownedBranchIds.size === 0) {
      res.json({ memberId: null, name: "", memberships: [] });
      return;
    }
    const profile = await fetchYoactivMemberByMobile(mobile);
    if (!profile) {
      res.json({ memberId: null, name: "", memberships: [] });
      return;
    }
    const memberships = profile.memberships.filter(
      (m) => m.branchId !== null && ownedBranchIds.has(m.branchId),
    );
    if (memberships.length === 0) {
      res.json({ memberId: null, name: "", memberships: [] });
      return;
    }
    res.json({
      memberId: profile.memberId,
      name: profile.name,
      memberships: memberships.map((m) => ({
        branchId: m.branchId,
        branchName: m.branchName,
        planName: m.planName,
        serviceName: m.serviceName,
        status: m.status,
        startDate: m.startDate,
        expiryDate: m.expiryDate,
        sessionsTotal: m.sessionsTotal,
        sessionsUsed: m.sessionsUsed,
        amountInr: m.amountInr,
      })),
    });
  },
);

export default router;
