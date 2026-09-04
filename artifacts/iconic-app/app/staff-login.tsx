import { useAuth, useSSO } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import { Feather } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import {
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { AppleSsoButton } from "@/components/AppleSsoButton";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { useColors } from "@/hooks/useColors";
import { ThemeContext } from "@/hooks/useTheme";
import {
  saveStaffProfile,
  staffFetch,
  type StaffProfile,
} from "@/lib/staffSession";

WebBrowser.maybeCompleteAuthSession();

// Permanently dark, cinematic brand screen — force the dark palette so it
// never washes out in system light mode.
const FORCE_DARK = {
  mode: "dark" as const,
  scheme: "dark" as const,
  setMode: () => {},
  toggle: () => {},
};

/**
 * Studio (staff) login — lives at the ROOT of the router (not inside the
 * `(auth)` group) on purpose: social SSO briefly creates a Clerk
 * session to prove the trainer owns the Gmail account, and the `(auth)`
 * layout would instantly redirect any Clerk-signed-in user to the member
 * tabs. Here we exchange the Clerk session for a staff cookie session and
 * immediately sign back out of Clerk.
 */
export default function StaffLoginScreen() {
  return (
    <ThemeContext.Provider value={FORCE_DARK}>
      <StaffLoginContent />
    </ThemeContext.Provider>
  );
}

function StaffLoginContent() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const { getToken, signOut } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ssoBusy, setSsoBusy] = useState<"google" | "apple" | null>(null);

  const finishLogin = useCallback(
    async (profile: StaffProfile) => {
      await saveStaffProfile(profile);
      router.replace("/staff-home");
    },
    [router],
  );

  const onLogin = useCallback(async () => {
    setError(null);
    const id = identifier.trim();
    if (!id || !password) {
      setError("Enter your email or username, and your password.");
      return;
    }
    setBusy(true);
    try {
      const res = await staffFetch("/staff/login", {
        method: "POST",
        body: JSON.stringify({ identifier: id, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Invalid credentials");
        return;
      }
      await finishLogin((await res.json()) as StaffProfile);
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }, [identifier, password, finishLogin]);

  const onSso = useCallback(async (provider: "google" | "apple") => {
    if (ssoBusy) return;
    const providerName = provider === "apple" ? "Apple" : "Google";
    setError(null);
    setSsoBusy(provider);
    let clerkSessionCreated = false;
    try {
      let sessionId: string | null = null;
      let activateSession:
        | ((params: { session: string }) => Promise<void>)
        | undefined;

      if (provider === "apple") {
        const appleResult = await startAppleAuthenticationFlow();
        sessionId = appleResult.createdSessionId;
        activateSession = appleResult.setActive;
        if (
          !sessionId &&
          appleResult.signUp &&
          appleResult.signUp.status === "missing_requirements" &&
          (appleResult.signUp.missingFields?.length ?? 0) === 0
        ) {
          const result = await appleResult.signUp.update({});
          if (result.status === "complete") {
            sessionId = result.createdSessionId;
          }
        }
        // The native hook returns no session when the user cancels.
        if (!sessionId || !activateSession) {
          if (appleResult.signUp?.status === "missing_requirements") {
            setError(
              "Apple sign-in needs additional account details before this staff identity can be verified.",
            );
          }
          return;
        }
      } else {
        const { createdSessionId, setActive, signUp, authSessionResult } =
          await startSSOFlow({
            strategy: "oauth_google",
            redirectUrl: AuthSession.makeRedirectUri(),
          });
        sessionId = createdSessionId;
        activateSession = setActive;
        if (
          !sessionId &&
          signUp &&
          signUp.status === "missing_requirements" &&
          (signUp.missingFields?.length ?? 0) === 0
        ) {
          const result = await signUp.update({});
          if (result.status === "complete") {
            sessionId = result.createdSessionId;
          }
        }
        if (!sessionId || !activateSession) {
          if (
            authSessionResult?.type !== "cancel" &&
            authSessionResult?.type !== "dismiss"
          ) {
            setError("Google sign-in didn't complete. Please try again.");
          }
          return;
        }
      }
      // Activate the Clerk session only long enough to mint a token proving
      // ownership of the verified email — we sign out again either way below.
      await activateSession({ session: sessionId });
      clerkSessionCreated = true;
      const token = await getToken();
      if (!token) {
        setError(`${providerName} sign-in didn't complete. Please try again.`);
        return;
      }
      const res = await staffFetch("/staff/sso-login", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error ??
            `This ${providerName} account isn't registered as staff. Ask the admin to add its verified email.`,
        );
        return;
      }
      const profile = (await res.json()) as StaffProfile;
      // Drop the temporary Clerk (member) session BEFORE entering the studio
      // area so the trainer isn't also signed in as a member. If sign-out
      // fails here, the flag stays true and the finally block retries.
      await signOut();
      clerkSessionCreated = false;
      await finishLogin(profile);
    } catch (err: unknown) {
      if (!isAppleCancellation(err)) {
        setError(`${providerName} sign-in failed. Please try again.`);
      }
    } finally {
      if (clerkSessionCreated) {
        await signOut().catch(() => {});
      }
      setSsoBusy(null);
    }
  }, [
    ssoBusy,
    startSSOFlow,
    startAppleAuthenticationFlow,
    getToken,
    signOut,
    finishLogin,
  ]);

  const scrim = colors.background;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ImageBackground
        source={require("@/assets/images/auth-hero.webp")}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      >
        <LinearGradient
          colors={[
            "rgba(10,12,8,0.45)",
            "rgba(10,12,8,0.15)",
            "rgba(10,12,8,0.78)",
            scrim,
            scrim,
          ]}
          locations={[0, 0.2, 0.48, 0.76, 1]}
          style={StyleSheet.absoluteFill}
        />
      </ImageBackground>

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(insets.top, 44) + 8,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/(auth)/welcome");
            }}
            hitSlop={12}
            style={styles.back}
          >
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </Pressable>

          <Image
            source={require("@/assets/images/auth-full-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <View style={styles.cardWrap}>
            <View
              style={[
                styles.card,
                { borderColor: "rgba(255,255,255,0.12)" },
              ]}
            >
              <LinearGradient
                colors={["rgba(255,255,255,0.07)", "rgba(255,255,255,0.015)"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.cardInner}>
                <View style={styles.headerRow}>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: "rgba(163,230,53,0.14)",
                        borderColor: "rgba(163,230,53,0.35)",
                      },
                    ]}
                  >
                    <Feather name="shield" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.headerText}>
                    <AppText
                      size={11}
                      weight="700"
                      color={colors.primary}
                      style={styles.eyebrow}
                    >
                      STUDIO ACCESS
                    </AppText>
                    <AppText size={20} weight="700">
                      Staff sign in
                    </AppText>
                  </View>
                </View>
                <AppText size={13} color={colors.mutedForeground}>
                  For trainers, MCs and the studio team. Use an account with
                  the verified email the admin registered, or your credentials.
                </AppText>

                <Button
                  label="Continue with Google"
                  onPress={() => void onSso("google")}
                  variant="secondary"
                  loading={ssoBusy === "google"}
                  disabled={ssoBusy !== null}
                  size="lg"
                />

                {Platform.OS === "ios" ? (
                  <AppleSsoButton
                    onPress={() => void onSso("apple")}
                    loading={ssoBusy === "apple"}
                    disabled={ssoBusy !== null}
                    tone="dark"
                  />
                ) : null}

                <View style={styles.dividerRow}>
                  <View
                    style={[
                      styles.dividerLine,
                      { backgroundColor: "rgba(255,255,255,0.12)" },
                    ]}
                  />
                  <AppText size={12} color={colors.mutedForeground}>
                    or with credentials
                  </AppText>
                  <View
                    style={[
                      styles.dividerLine,
                      { backgroundColor: "rgba(255,255,255,0.12)" },
                    ]}
                  />
                </View>

                <Field
                  label="Email or username"
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="you@studio.com or username"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="username"
                />
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Your password"
                  autoCapitalize="none"
                  secureTextEntry
                />

                {error ? (
                  <AppText size={13} color={colors.destructive}>
                    {error}
                  </AppText>
                ) : null}

                <Button
                  label="Log in to studio"
                  onPress={onLogin}
                  loading={busy}
                  size="lg"
                />
              </View>
            </View>

            <Pressable
              onPress={() => router.replace("/(auth)/sign-in")}
              hitSlop={8}
              style={styles.switch}
            >
              <AppText weight="600" size={14} color={colors.mutedForeground}>
                Not staff? Membership login
              </AppText>
              <Feather
                name="arrow-right"
                size={16}
                color={colors.mutedForeground}
              />
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function isAppleCancellation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "ERR_REQUEST_CANCELED"
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(10,12,8,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 165,
    height: 165,
    alignSelf: "center",
  },
  cardWrap: { marginTop: "auto", paddingTop: 12, paddingBottom: 8, gap: 14 },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "rgba(14,17,11,0.66)",
  },
  cardInner: { padding: 20, gap: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { gap: 2 },
  eyebrow: { letterSpacing: 4 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  switch: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 4,
  },
});
