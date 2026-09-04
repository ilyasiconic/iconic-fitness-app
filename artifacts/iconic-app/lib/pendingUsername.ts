import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "iconic.pendingMemberUsername";
const TTL_MS = 30 * 60 * 1000;

export type PendingUsername = {
  username: string;
  clerkUserId: string;
};

export async function setPendingUsername(
  username: string,
  clerkUserId: string,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ username, clerkUserId, createdAt: Date.now() }),
    );
  } catch {
    // Best effort — the member can still add a username from Profile.
  }
}

export async function getPendingUsername(): Promise<PendingUsername | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const username =
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { username?: unknown }).username === "string"
        ? (parsed as { username: string }).username.trim().toLowerCase()
        : "";
    const createdAt =
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { createdAt?: unknown }).createdAt === "number"
        ? (parsed as { createdAt: number }).createdAt
        : 0;
    const clerkUserId =
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { clerkUserId?: unknown }).clerkUserId === "string"
        ? (parsed as { clerkUserId: string }).clerkUserId
        : "";
    if (
      !/^[a-z][a-z0-9._]{2,29}$/.test(username) ||
      !clerkUserId ||
      !Number.isFinite(createdAt) ||
      Date.now() - createdAt > TTL_MS
    ) {
      await clearPendingUsername();
      return null;
    }
    return { username, clerkUserId };
  } catch {
    await clearPendingUsername();
    return null;
  }
}

export async function clearPendingUsername(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}