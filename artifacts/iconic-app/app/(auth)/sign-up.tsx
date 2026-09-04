import { useSignUp, useSSO } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import * as AuthSession from "expo-auth-session";
import { Link, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import {
  Image,
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
import { useGuest } from "@/hooks/useGuest";
import { setPendingUsername } from "@/lib/pendingUsername";
import { customFetch } from "@workspace/api-client-react";

WebBrowser.maybeCompleteAuthSession();

export default function SignUpScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp, fetchStatus } = useSignUp();
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const { exitGuest } = useGuest();

  const [stage, setStage] = useState<"form" | "verify">("form");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ssoLoading, setSsoLoading] = useState<"google" | "apple" | null>(null);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  const onCreate = useCallback(async () => {
    setError(null);
    const normalizedUsername = username.trim().toLowerCase();
    if (!/^[a-z][a-z0-9._]{2,29}$/.test(normalizedUsername)) {
      setError(
        "Username must be 3–30 characters, start with a letter, and use only letters, numbers, dots, or underscores.",
      );
      return;
    }
    try {
      const availability = await customFetch<{ available: boolean }>(
        "/api/auth/username-availability",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: normalizedUsername }),
        },
      );
      if (!availability.available) {
        setError("That username is already taken.");
        return;
      }
      const { error: signUpError } = await signUp.password({
        emailAddress: email.trim(),
        password,
      });
      if (signUpError) {
        setError(clerkError(signUpError));
        return;
      }
      await signUp.verifications.sendEmailCode();
      setStage("verify");
    } catch (err: unknown) {
      setError(clerkError(err));
    }
  }, [signUp, username, email, password]);

  const onVerify = useCallback(async () => {
    setError(null);
    try {
      await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (signUp.status === "complete") {
        const normalizedUsername = username.trim().toLowerCase();
        if (signUp.createdUserId && normalizedUsername) {
          await setPendingUsername(normalizedUsername, signUp.createdUserId);
        }
        if (name.trim()) {
          try {
            await signUp.update({ firstName: name.trim() });
          } catch {
            // Name is optional; ignore if the instance rejects it.
          }
        }
        exitGuest();
        await signUp.finalize({ navigate: () => router.replace("/(tabs)") });
      } else {
        setError("Invalid code. Please try again.");
      }
    } catch (err: unknown) {
      setError(clerkError(err));
    }
  }, [signUp, code, username, name, router, exitGuest]);

  const onGoogle = useCallback(async () => {
    if (ssoLoading) return;
    setError(null);
    setSsoLoading("google");
    try {
      if (signUp.status !== null) {
        await signUp.reset();
      }
      const {
        createdSessionId,
        setActive,
        signUp: ssoSignUp,
        authSessionResult,
      } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      let sessionId = createdSessionId;
      if (
        !sessionId &&
        ssoSignUp &&
        ssoSignUp.status === "missing_requirements" &&
        (ssoSignUp.missingFields?.length ?? 0) === 0
      ) {
        const result = await ssoSignUp.update({});
        if (result.status === "complete") {
          sessionId = result.createdSessionId;
        }
      }
      if (sessionId && setActive) {
        exitGuest();
        await setActive({ session: sessionId });
        router.replace("/(tabs)");
      } else if (
        authSessionResult?.type !== "cancel" &&
        authSessionResult?.type !== "dismiss"
      ) {
        setError(
          "Google sign-in could not finish. Please try again, or create an account with your email.",
        );
      }
    } catch (err: unknown) {
      setError(clerkError(err));
    } finally {
      setSsoLoading(null);
    }
  }, [ssoLoading, signUp, startSSOFlow, router, exitGuest]);

  const onApple = useCallback(async () => {
    if (ssoLoading) return;
    setError(null);
    setSsoLoading("apple");
    try {
      const { createdSessionId, setActive, signUp: appleSignUp } =
        await startAppleAuthenticationFlow();
      let sessionId = createdSessionId;
      if (
        !sessionId &&
        appleSignUp &&
        appleSignUp.status === "missing_requirements" &&
        (appleSignUp.missingFields?.length ?? 0) === 0
      ) {
        const result = await appleSignUp.update({});
        if (result.status === "complete") sessionId = result.createdSessionId;
      }
      if (!sessionId || !setActive) {
        if (appleSignUp?.status === "missing_requirements") {
          setError(
            "Apple sign-in needs additional account details. Please create your account with email first.",
          );
        }
        return;
      }
      exitGuest();
      await setActive({
        session: sessionId,
        navigate: () => router.replace("/(tabs)"),
      });
    } catch (err: unknown) {
      if (!isAppleCancellation(err)) setError(clerkError(err));
    } finally {
      setSsoLoading(null);
    }
  }, [ssoLoading, startAppleAuthenticationFlow, router, exitGuest]);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior="padding"
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={require("@/assets/images/auth-logo-mark.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        {stage === "form" ? (
          <>
            <AppText weight="700" size={32} style={{ marginTop: 24 }}>
              Join Iconic
            </AppText>
            <AppText muted size={15} style={{ marginBottom: 28 }}>
              Start tracking, training and winning.
            </AppText>

            <View style={styles.form}>
              {/* Mobile pre-verify box hidden by owner request — members can
                  still link their number later from inside the app. */}
              <Field
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                autoCapitalize="words"
              />
              <Field
                label="Username"
                value={username}
                onChangeText={setUsername}
                placeholder="e.g. iconic.member"
                autoCapitalize="none"
                autoComplete="username-new"
              />
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                secureTextEntry
                autoComplete="password-new"
              />

              {error ? (
                <AppText size={13} color={colors.destructive}>
                  {error}
                </AppText>
              ) : null}

              <Button
                label="Create account"
                onPress={onCreate}
                loading={fetchStatus === "fetching"}
                size="lg"
              />

              <View style={styles.divider}>
                <View
                  style={[styles.line, { backgroundColor: colors.border }]}
                />
                <AppText size={12} muted>
                  OR
                </AppText>
                <View
                  style={[styles.line, { backgroundColor: colors.border }]}
                />
              </View>

              <Button
                label="Continue with Google"
                onPress={onGoogle}
                variant="secondary"
                icon="chrome"
                loading={ssoLoading === "google"}
                disabled={ssoLoading !== null}
                size="lg"
              />

              {Platform.OS === "ios" ? (
                <AppleSsoButton
                  onPress={onApple}
                  loading={ssoLoading === "apple"}
                  disabled={ssoLoading !== null}
                  tone="light"
                />
              ) : null}
            </View>

            <View style={styles.footer}>
              <AppText muted size={14}>
                Already a member?{" "}
              </AppText>
              <Link href="/(auth)/sign-in" asChild>
                <Pressable hitSlop={8}>
                  <AppText weight="700" size={14} color={colors.primary}>
                    Log in
                  </AppText>
                </Pressable>
              </Link>
            </View>
          </>
        ) : (
          <>
            <AppText weight="700" size={32} style={{ marginTop: 24 }}>
              Check your email
            </AppText>
            <AppText muted size={15} style={{ marginBottom: 28 }}>
              We sent a 6-digit code to {email}.
            </AppText>

            <View style={styles.form}>
              <Field
                label="Verification code"
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                keyboardType="number-pad"
                autoComplete="one-time-code"
              />

              {error ? (
                <AppText size={13} color={colors.destructive}>
                  {error}
                </AppText>
              ) : null}

              <Button
                label="Verify & continue"
                onPress={onVerify}
                loading={fetchStatus === "fetching"}
                size="lg"
              />
              <Pressable
                onPress={() => signUp.verifications.sendEmailCode()}
                hitSlop={8}
              >
                <AppText muted size={13} style={{ textAlign: "center" }}>
                  Resend code
                </AppText>
              </Pressable>
            </View>
          </>
        )}

        {/* Required for Clerk bot sign-up protection */}
        <View nativeID="clerk-captcha" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function clerkError(err: unknown): string {
  const e = err as {
    errors?: { longMessage?: string; message?: string }[];
    message?: string;
  };
  return (
    e?.errors?.[0]?.longMessage ??
    e?.errors?.[0]?.message ??
    e?.message ??
    "Something went wrong. Please try again."
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
  content: { paddingHorizontal: 24 },
  logo: {
    width: 84,
    height: 84,
  },
  form: { gap: 16 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 28,
    alignItems: "center",
  },
});
