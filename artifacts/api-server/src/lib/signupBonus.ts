import { eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { creditWallet } from "./referrals";

/** Admin-configurable welcome bonus (points, 1 point = ₹1) granted once to
 *  every newly created member account. 0 (the default) disables the bonus. */
export const SIGNUP_BONUS_SETTING_KEY = "signup_bonus_points";

export async function signupBonusPoints(): Promise<number> {
  const [row] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, SIGNUP_BONUS_SETTING_KEY));
  const n = Math.round(Number(row?.value ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Credit the welcome bonus to a brand-new member. Idempotent via the
 *  (refType, refId) unique index on wallet_transactions — a concurrent
 *  double-provision can never credit twice. Best effort: never throws. */
export async function grantSignupBonus(userId: number): Promise<void> {
  try {
    const points = await signupBonusPoints();
    if (points <= 0) return;
    await creditWallet({
      userId,
      amountInr: points,
      kind: "signup_bonus",
      label: "Welcome bonus — thanks for joining Iconic Fitness!",
      refType: "signup_bonus",
      refId: String(userId),
    });
  } catch (err) {
    console.error("[signup-bonus] credit failed:", err);
  }
}
