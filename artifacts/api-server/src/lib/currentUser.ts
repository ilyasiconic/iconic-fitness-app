import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { grantSignupBonus } from "./signupBonus";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
      clerkUserId?: string;
    }
  }
}

function randomMemberCode() {
  return "GYM-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function jitProvision(clerkUserId: string): Promise<number> {
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId));
  if (existing[0]) return existing[0].id;

  let name = "Member";
  let email = `${clerkUserId}@gymco.local`;
  let avatarUrl = "";
  try {
    const u = await clerkClient.users.getUser(clerkUserId);
    const first = u.firstName ?? "";
    const last = u.lastName ?? "";
    const full = `${first} ${last}`.trim();
    name = full || u.username || (u.emailAddresses[0]?.emailAddress?.split("@")[0] ?? "Member");
    email = u.emailAddresses[0]?.emailAddress ?? email;
    avatarUrl = u.imageUrl ?? "";
  } catch {
    // Clerk lookup failed — fall back to placeholders; user can edit profile.
  }

  const inserted = await db
    .insert(usersTable)
    .values({
      clerkUserId,
      name,
      email,
      mobile: "",
      gender: "prefer_not_to_say",
      age: 25,
      heightCm: 170,
      weightKg: 70,
      fitnessGoal: "general_fitness",
      avatarUrl,
      city: "Bengaluru",
      memberCode: randomMemberCode(),
    })
    .onConflictDoNothing({ target: usersTable.clerkUserId })
    .returning({ id: usersTable.id });
  if (inserted[0]) {
    // Welcome (signup) bonus: admin-configurable points credited exactly once
    // per new member — the (refType, refId) unique index makes this idempotent
    // even if two first requests race. Best effort; never blocks login.
    void grantSignupBonus(inserted[0].id);
    return inserted[0].id;
  }

  // Lost the race against a concurrent insert — re-select the winner.
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId));
  if (!row) throw new Error("JIT provisioning failed after conflict");
  return row.id;
}

/**
 * Resolve the caller's user id when they are signed in, but never reject the
 * request. Guest callers continue with `req.userId` undefined. Used on
 * endpoints that serve both members and guests (e.g. guest checkout).
 */
export const optionalUser: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    next();
    return;
  }
  try {
    req.clerkUserId = clerkUserId;
    req.userId = await jitProvision(clerkUserId);
  } catch (err) {
    // A provisioning hiccup must not block a guest-capable endpoint — the
    // request simply proceeds unauthenticated.
    req.log?.error({ err }, "Optional user provisioning failed");
  }
  next();
};

export const requireUser: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    req.clerkUserId = clerkUserId;
    req.userId = await jitProvision(clerkUserId);
    next();
  } catch (err) {
    req.log?.error({ err }, "JIT user provisioning failed");
    res.status(500).json({ error: "User provisioning failed" });
  }
};
