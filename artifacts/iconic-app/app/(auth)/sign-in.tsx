import { useSignIn, useSSO } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import { customFetch } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useFocusEffect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
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
import { useGuest } from "@/hooks/useGuest";
import { ThemeContext } from "@/hooks/useTheme";
import { openExternal, websiteUrl } from "@/lib/links";

WebBrowser.maybeCompleteAuthSession();

// The login is a permanently dark, cinematic brand screen — force the dark
// palette for this subtree so it never washes out in system light mode.
const FORCE_DARK = {
  mode: "dark" as const,
  scheme: "dark" as const,
  setMode: () => {},
  toggle: () => {},
};

export default function SignInScreen() {
  return (
    <ThemeContext.Provider value={FORCE_DARK}>
      <SignInContent />
    </ThemeContext.Provider>
  );
}

function SignInContent() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const { enterGuest, exitGuest } = useGuest();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ssoLoading, setSsoLoading] = useState<"google" | "apple" | null>(null);

  // OTP (one-time email code) login — the only email login flow
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpInfo, setOtpInfo] = useState<string | null>(null);

  // Password login accepts the member's username, email, or gym mobile. The
  // server resolves it without revealing account details.
  const [mode, setMode] = useState<"otp" | "password">("otp");
  const [pwIdentifier, setPwIdentifier] = useState("");
  const [pwPassword, setPwPassword] = useState("");
  const [pwStage, setPwStage] = useState<"login" | "resetEmail" | "resetVerify">(
    "login",
  );
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwInfo, setPwInfo] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      // Expo Router keeps screens mounted in its stack. Clear any error left
      // by the previous sign-in attempt when logout reveals this screen again.
      setError(null);
    }, []),
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  const finalizeSignIn = useCallback(async () => {
    exitGuest();
    await signIn.finalize({ navigate: () => router.replace("/(tabs)") });
  }, [signIn, router, exitGuest]);

  const onSendOtp = useCallback(async () => {
    setError(null);
    setOtpInfo(null);
    const address = email.trim();
    if (!address.includes("@")) {
      setError("Enter your email address to receive a login code.");
      return;
    }
    try {
      const { error: sendError } = await signIn.emailCode.sendCode({
        emailAddress: address,
      });
      if (sendError) {
        setError(clerkError(sendError));
        return;
      }
      setOtpSent(true);
      setOtpCode("");
      setOtpInfo(`We emailed a 6-digit code to ${address}.`);
    } catch (err: unknown) {
      setError(clerkError(err));
    }
  }, [signIn, email]);

  const onVerifyOtp = useCallback(async () => {
    setError(null);
    const code = otpCode.trim();
    if (code.length < 4) {
      setError("Enter the code from your email.");
      return;
    }
    try {
      const { error: verifyError } = await signIn.emailCode.verifyCode({
        code,
      });
      if (verifyError) {
        setError(clerkError(verifyError));
        return;
      }
      if (signIn.status === "complete") {
        await finalizeSignIn();
      } else {
        setError("Additional verification is required to sign in.");
      }
    } catch (err: unknown) {
      setError(clerkError(err));
    }
  }, [signIn, otpCode, finalizeSignIn]);

  const onPasswordLogin = useCallback(async () => {
    setError(null);
    setPwInfo(null);
    const identifier = pwIdentifier.trim();
    if (identifier.length < 3) {
      setError("Enter your username, email, or mobile number.");
      return;
    }
    if (pwPassword.length < 1) {
      setError("Enter your password.");
      return;
    }
    setPwBusy(true);
    try {
      // Password is checked server-side; on success we get a short-lived
      // one-time sign-in ticket (the account email is never exposed).
      const result = await customFetch<{ ticket: string }>(
        "/api/auth/password-login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ identifier, password: pwPassword }),
        },
      );
      if (signIn.status !== null) {
        try {
          await signIn.reset();
        } catch {
          // A stale attempt shouldn't block a fresh ticket sign-in.
        }
      }
      const { error: ticketError } = await signIn.create({
        strategy: "ticket",
        ticket: result.ticket,
      });
      if (ticketError) {
        setError(clerkError(ticketError));
        return;
      }
      if (signIn.status === "complete") {
        await finalizeSignIn();
      } else {
        setError("Additional verification is required to sign in.");
      }
    } catch (err: unknown) {
      const apiMessage = (
        err as {
          data?: { error?: string };
          body?: { error?: string };
        }
      )?.data?.error ??
        (err as { body?: { error?: string } })?.body?.error;
      setError(apiMessage ?? clerkError(err));
    } finally {
      setPwBusy(false);
    }
  }, [signIn, pwIdentifier, pwPassword, finalizeSignIn]);

  const onStartPasswordReset = useCallback(async () => {
    setError(null);
    setPwInfo(null);
    const address = resetEmail.trim();
    if (!address.includes("@")) {
      setError("Enter the email address you signed up with.");
      return;
    }
    setPwBusy(true);
    try {
      if (signIn.status !== null) {
        try {
          await signIn.reset();
        } catch {
          // A stale attempt shouldn't block starting a fresh reset.
        }
      }
      const { error: createError } = await signIn.create({
        identifier: address,
      });
      if (!createError) {
        await signIn.resetPasswordEmailCode.sendCode();
      }
      setPwStage("resetVerify");
      setResetCode("");
      setNewPassword("");
      setPwInfo(
        "If an account exists for that email, we sent it a 6-digit reset code.",
      );
    } catch {
      setPwStage("resetVerify");
      setResetCode("");
      setNewPassword("");
      setPwInfo(
        "If an account exists for that email, we sent it a 6-digit reset code.",
      );
    } finally {
      setPwBusy(false);
    }
  }, [signIn, resetEmail]);

  // The reset attempt can silently go stale (app reload, long pause, or a
  // mixed-up earlier attempt). Instead of showing Clerk's confusing "send a
  // verification code before attempting to verify" error, restart the flow
  // and email a fresh code automatically.
  const restartResetWithFreshCode = useCallback(async () => {
    const address = resetEmail.trim();
    if (!address.includes("@")) {
      setPwStage("resetEmail");
      setError("Enter your email again — the session expired.");
      return;
    }
    try {
      if (signIn.status !== null) {
        try {
          await signIn.reset();
        } catch {
          // A stale attempt shouldn't block a fresh reset.
        }
      }
      const { error: createError } = await signIn.create({
        identifier: address,
      });
      if (!createError) {
        await signIn.resetPasswordEmailCode.sendCode();
      }
      setResetCode("");
      setPwInfo(
        "If an account exists for that email, we sent it a fresh reset code.",
      );
    } catch {
      setResetCode("");
      setPwInfo(
        "If an account exists for that email, we sent it a fresh reset code.",
      );
    }
  }, [signIn, resetEmail]);

  const onSubmitPasswordReset = useCallback(async () => {
    setError(null);
    if (resetCode.trim().length < 4) {
      setError("Enter the code from your email.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    setPwBusy(true);
    try {
      // If the attempt went stale, don't even try to verify — the typed code
      // belongs to a dead session. Send a fresh code instead.
      if (signIn.status === null) {
        await restartResetWithFreshCode();
        return;
      }
      const { error: verifyError } =
        await signIn.resetPasswordEmailCode.verifyCode({
          code: resetCode.trim(),
        });
      if (verifyError) {
        const message = clerkError(verifyError);
        if (/send a verification code/i.test(message)) {
          await restartResetWithFreshCode();
          return;
        }
        setError(message);
        return;
      }
      const { error: submitError } =
        await signIn.resetPasswordEmailCode.submitPassword({
          password: newPassword,
        });
      if (submitError) {
        setError(clerkError(submitError));
        return;
      }
      if (signIn.status === "complete") {
        await finalizeSignIn();
      } else {
        setError("Additional verification is required to sign in.");
      }
    } catch (err: unknown) {
      const message = clerkError(err);
      if (/send a verification code/i.test(message)) {
        await restartResetWithFreshCode();
        return;
      }
      setError(message);
    } finally {
      setPwBusy(false);
    }
  }, [signIn, resetCode, newPassword, finalizeSignIn, restartResetWithFreshCode]);

  const switchMode = useCallback(
    async (next: "otp" | "password") => {
      setMode(next);
      setError(null);
      setPwInfo(null);
      setOtpInfo(null);
      setOtpSent(false);
      setOtpCode("");
      setPwStage("login");
      setResetEmail("");
      setResetCode("");
      setNewPassword("");
      if (signIn.status !== null) {
        try {
          await signIn.reset();
        } catch {
          // Ignore — a stale attempt shouldn't block switching modes.
        }
      }
    },
    [signIn],
  );

  const onChangeEmail = useCallback(async () => {
    setError(null);
    setOtpInfo(null);
    setOtpSent(false);
    setOtpCode("");
    if (signIn.status !== null) {
      try {
        await signIn.reset();
      } catch {
        // A stale attempt that can't reset shouldn't block editing the email.
      }
    }
  }, [signIn]);

  const onGoogle = useCallback(async () => {
    if (ssoLoading) return;
    setError(null);
    setSsoLoading("google");
    try {
      // Switching from OTP/password to Google can leave a partial Clerk
      // attempt behind. On Android that stale attempt can win when the custom
      // tab returns, leaving the user back on the login screen.
      if (signIn.status !== null) {
        await signIn.reset();
      }
      const { createdSessionId, setActive, signUp, authSessionResult } =
        await startSSOFlow({
          strategy: "oauth_google",
          redirectUrl: AuthSession.makeRedirectUri(),
        });
      let sessionId = createdSessionId;
      // First-time social users can come back as an incomplete sign-up instead of
      // a session. When nothing is actually missing, completing the sign-up
      // with an empty update yields the session (silently "going back" to the
      // login screen otherwise).
      if (
        !sessionId &&
        signUp &&
        signUp.status === "missing_requirements" &&
        (signUp.missingFields?.length ?? 0) === 0
      ) {
        const res = await signUp.update({});
        if (res.status === "complete") sessionId = res.createdSessionId;
      }
      if (sessionId && setActive) {
        exitGuest();
        // Persist the active Clerk session before changing routes. This avoids
        // the auth gate briefly seeing a signed-out user after Android resumes
        // from Google's browser tab and redirecting back to login.
        await setActive({ session: sessionId });
        router.replace("/(tabs)");
      } else if (
        authSessionResult?.type !== "cancel" &&
        authSessionResult?.type !== "dismiss"
      ) {
        // Don't fail silently — the user picked an account and expects to be
        // signed in. Surface a readable message instead of "nothing happens".
        setError(
          "Google sign-in could not finish. Please try again, or log in with your email.",
        );
      }
    } catch (err: unknown) {
      setError(clerkError(err));
    } finally {
      setSsoLoading(null);
    }
  }, [ssoLoading, signIn, startSSOFlow, router, exitGuest]);

  const onApple = useCallback(async () => {
    if (ssoLoading) return;
    setError(null);
    setSsoLoading("apple");
    try {
      // A partially started email/ticket attempt can remain in Clerk while the
      // user switches methods. Native Apple sign-in must begin from a clean
      // attempt or the token exchange can fail on the reviewer's device.
      if (signIn.status !== null) {
        await signIn.reset();
      }
      const { createdSessionId, setActive, signUp } =
        await startAppleAuthenticationFlow();
      let sessionId = createdSessionId;
      if (
        !sessionId &&
        signUp &&
        signUp.status === "missing_requirements" &&
        (signUp.missingFields?.length ?? 0) === 0
      ) {
        const result = await signUp.update({});
        if (result.status === "complete") sessionId = result.createdSessionId;
      }
      // The native hook returns no session when the user cancels.
      if (!sessionId || !setActive) {
        if (signUp?.status === "missing_requirements") {
          setError(
            "Apple sign-in needs additional account details. Please create your account with email, then connect Apple.",
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
  }, [ssoLoading, signIn, startAppleAuthenticationFlow, router, exitGuest]);

  const onContinueWithoutLogin = useCallback(() => {
    enterGuest();
    router.replace("/(tabs)");
  }, [enterGuest, router]);

  const scrim = colors.background;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Cinematic hero background */}
      <ImageBackground
        source={require("@/assets/images/auth-hero.webp")}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      >
        <LinearGradient
          colors={[
            "rgba(10,12,8,0.35)",
            "rgba(10,12,8,0.10)",
            "rgba(10,12,8,0.70)",
            scrim,
            scrim,
          ]}
          locations={[0, 0.22, 0.5, 0.78, 1]}
          style={StyleSheet.absoluteFill}
        />
      </ImageBackground>

      {/* Lime ambient accent */}
      <View pointerEvents="none" style={styles.ambientWrap}>
        <View style={[styles.ambient, { backgroundColor: colors.primary }]} />
      </View>

      {/* Android (edge-to-edge) no longer resizes the window for the keyboard,
          so pad on both platforms or the bottom-anchored form stays hidden
          behind the keyboard while typing. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {/* Logo pinned top; form anchored bottom via marginTop:auto.
            Scrolls only when the viewport/keyboard leaves too little room. */}
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
          {/* Brand logo — top, centered */}
          <Image
            source={require("@/assets/images/auth-logo-mark.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          {/* Auth form — anchored to the bottom */}
          <View style={styles.form}>
            <AppText
              size={12}
              weight="700"
              color={colors.primary}
              style={styles.eyebrow}
            >
              WELCOME BACK
            </AppText>

            {/* Mobile pre-verify box hidden by owner request — members can
                still link their number later from inside the app. */}

            {mode === "otp" ? (
              <>
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@email.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  editable={!otpSent}
                />

                {otpSent ? (
                  <Field
                    label="One-time code"
                    value={otpCode}
                    onChangeText={setOtpCode}
                    placeholder="6-digit code"
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    maxLength={8}
                  />
                ) : null}
              </>
            ) : (
              <>
                {pwStage === "login" ? (
                  <>
                    <Field
                      label="Username, email, or mobile"
                      value={pwIdentifier}
                      onChangeText={setPwIdentifier}
                      placeholder="Your login identifier"
                      autoCapitalize="none"
                    />
                    <Field
                      label="Password"
                      value={pwPassword}
                      onChangeText={setPwPassword}
                      placeholder="Your password"
                      secureTextEntry
                      autoCapitalize="none"
                      autoComplete="password"
                    />
                  </>
                ) : pwStage === "resetEmail" ? (
                  <Field
                    label="Your account email"
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    placeholder="you@email.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                  />
                ) : (
                  <>
                    <Field
                      label="Email code"
                      value={resetCode}
                      onChangeText={setResetCode}
                      placeholder="6-digit code from your email"
                      keyboardType="number-pad"
                      autoComplete="one-time-code"
                      maxLength={8}
                    />
                    <Field
                      label="New password"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="At least 8 characters"
                      secureTextEntry
                      autoCapitalize="none"
                      autoComplete="new-password"
                    />
                  </>
                )}
              </>
            )}

            {(mode === "otp" ? otpInfo : pwInfo) && !error ? (
              <AppText size={13} color={colors.primary}>
                {mode === "otp" ? otpInfo : pwInfo}
              </AppText>
            ) : null}
            {error ? (
              <AppText size={13} color={colors.destructive}>
                {error}
              </AppText>
            ) : null}

            {mode === "otp" ? (
              !otpSent ? (
                <Button
                  label="Email me a login code"
                  onPress={onSendOtp}
                  loading={fetchStatus === "fetching"}
                  size="lg"
                />
              ) : (
                <>
                  <Button
                    label="Verify code & log in"
                    onPress={onVerifyOtp}
                    loading={fetchStatus === "fetching"}
                    size="lg"
                  />
                  <Pressable
                    onPress={onSendOtp}
                    disabled={fetchStatus === "fetching"}
                    hitSlop={8}
                    style={styles.modeSwitch}
                  >
                    <AppText weight="600" size={13} color={colors.mutedForeground}>
                      Didn&apos;t get it? Resend code
                    </AppText>
                  </Pressable>
                  <Pressable
                    onPress={onChangeEmail}
                    disabled={fetchStatus === "fetching"}
                    hitSlop={8}
                    style={styles.modeSwitch}
                  >
                    <AppText weight="600" size={13} color={colors.mutedForeground}>
                      Use a different email
                    </AppText>
                  </Pressable>
                </>
              )
            ) : pwStage === "login" ? (
              <>
                <Button
                  label="Log in with password"
                  onPress={onPasswordLogin}
                  loading={pwBusy || fetchStatus === "fetching"}
                  size="lg"
                />
                <Pressable
                  onPress={() => {
                    setError(null);
                    setPwInfo(null);
                    setPwStage("resetEmail");
                  }}
                  disabled={pwBusy}
                  hitSlop={8}
                  style={styles.modeSwitch}
                >
                  <AppText weight="600" size={13} color={colors.mutedForeground}>
                    Forgot password? / Create a password
                  </AppText>
                </Pressable>
              </>
            ) : pwStage === "resetEmail" ? (
              <>
                <Button
                  label="Email me a reset code"
                  onPress={onStartPasswordReset}
                  loading={pwBusy || fetchStatus === "fetching"}
                  size="lg"
                />
                <Pressable
                  onPress={() => {
                    setError(null);
                    setPwInfo(null);
                    setPwStage("login");
                  }}
                  disabled={pwBusy}
                  hitSlop={8}
                  style={styles.modeSwitch}
                >
                  <AppText weight="600" size={13} color={colors.mutedForeground}>
                    Back to password login
                  </AppText>
                </Pressable>
              </>
            ) : (
              <>
                <Button
                  label="Set new password & log in"
                  onPress={onSubmitPasswordReset}
                  loading={pwBusy || fetchStatus === "fetching"}
                  size="lg"
                />
                <Pressable
                  onPress={onStartPasswordReset}
                  disabled={pwBusy}
                  hitSlop={8}
                  style={styles.modeSwitch}
                >
                  <AppText weight="600" size={13} color={colors.mutedForeground}>
                    Didn&apos;t get it? Resend code
                  </AppText>
                </Pressable>
              </>
            )}

            <Pressable
              onPress={() =>
                void switchMode(mode === "otp" ? "password" : "otp")
              }
              disabled={pwBusy || fetchStatus === "fetching"}
              hitSlop={8}
              style={styles.modeSwitch}
            >
              <AppText weight="600" size={13} color={colors.primary}>
                {mode === "otp"
                  ? "Log in with username & password"
                  : "Log in with email code instead"}
              </AppText>
            </Pressable>

            <View style={styles.divider}>
              <View style={[styles.line, { backgroundColor: colors.border }]} />
              <AppText size={11} weight="600" muted style={styles.dividerText}>
                OR CONTINUE WITH
              </AppText>
              <View style={[styles.line, { backgroundColor: colors.border }]} />
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
                tone="dark"
              />
            ) : null}

            {/* Footer */}
            <View style={styles.footer}>
              <AppText muted size={14}>
                New here?{" "}
              </AppText>
              <Link href="/(auth)/sign-up" asChild>
                <Pressable hitSlop={8}>
                  <AppText weight="700" size={14} color={colors.primary}>
                    Create account
                  </AppText>
                </Pressable>
              </Link>
            </View>

            <Pressable
              onPress={onContinueWithoutLogin}
              hitSlop={8}
              style={styles.skip}
            >
              <AppText weight="600" size={14} color={colors.mutedForeground}>
                Continue without login
              </AppText>
              <Feather
                name="arrow-right"
                size={16}
                color={colors.mutedForeground}
              />
            </Pressable>

            <Pressable
              onPress={() => void openExternal(websiteUrl)}
              hitSlop={8}
              style={styles.legal}
            >
              <AppText size={11} weight="600" color={colors.mutedForeground}>
                PRIVACY POLICY  ·  TERMS OF SERVICE
              </AppText>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
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
    "Unable to sign in. Check your details."
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
  content: { flexGrow: 1, paddingHorizontal: 24 },
  ambientWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    pointerEvents: "none",
  },
  ambient: {
    position: "absolute",
    top: -120,
    width: 600,
    height: 600,
    borderRadius: 300,
    opacity: 0.15,
  },
  logo: {
    width: 210,
    height: 210,
    alignSelf: "center",
  },
  eyebrow: { letterSpacing: 4, marginBottom: 2 },
  form: { gap: 16, marginTop: "auto", paddingTop: 24, paddingBottom: 12 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  dividerText: { letterSpacing: 1.5 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
    alignItems: "center",
  },
  skip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 4,
  },
  modeSwitch: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  legal: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
});
