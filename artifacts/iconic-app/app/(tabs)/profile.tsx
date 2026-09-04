import { useClerk, useUser } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import {
  getGetMeQueryKey,
  getGetMyMembershipQueryKey,
  getGetTrackingSummaryQueryKey,
  useGetGoals,
  useGetMe,
  useGetMyMembership,
  useListMyMembershipPayments,
  getListMyMembershipPaymentsQueryKey,
  useListMyPackageBookings,
  getListMyPackageBookingsQueryKey,
  useUpdateGoals,
  useUpdateMe,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Image, Platform, StyleSheet, Switch, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Field } from "@/components/Field";
import { ProfilePhotoPicker } from "@/components/ProfilePhotoPicker";
import { Screen } from "@/components/Screen";
import { Chip, ChipRow, SectionHeader } from "@/components/ui-bits";
import { useColors } from "@/hooks/useColors";
import { useAuthClientReset } from "@/hooks/useAuthClientReset";
import { useGuest } from "@/hooks/useGuest";
import { useTheme, type ThemeMode } from "@/hooks/useTheme";
import { istDateLabel, istDateStr } from "@/lib/dates";

/** Whole IST calendar days from today until `dateIso` (negative = past). */
function daysUntilIst(dateIso: string): number {
  const today = Date.parse(`${istDateStr()}T00:00:00Z`);
  const target = Date.parse(`${istDateStr(new Date(dateIso))}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}
import {
  ACTION_REMINDERS,
  areRemindersOn,
  cancelActionReminders,
  scheduleActionReminders,
} from "@/lib/notifications";

const GENDER_OPTIONS = ["male", "female", "other"];

const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
  { mode: "system", label: "System" },
];

function formatHour(h: number, m: number): string {
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return m === 0
    ? `${display} ${period}`
    : `${display}:${String(m).padStart(2, "0")} ${period}`;
}

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const resetAuthClient = useAuthClientReset();
  const { isGuest, exitGuest } = useGuest();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const queryClient = useQueryClient();

  const meQuery = useGetMe();
  const goalsQuery = useGetGoals();
  const updateGoals = useUpdateGoals();
  const membershipQuery = useGetMyMembership({
    query: { queryKey: getGetMyMembershipQueryKey(), enabled: !isGuest },
  });
  const paymentsQuery = useListMyMembershipPayments({
    query: {
      queryKey: getListMyMembershipPaymentsQueryKey(),
      enabled: !isGuest,
    },
  });
  const purchasesQuery = useListMyPackageBookings({
    query: {
      queryKey: getListMyPackageBookingsQueryKey(),
      enabled: !isGuest,
    },
  });
  const updateMe = useUpdateMe();

  const [water, setWater] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [steps, setSteps] = useState("");
  const [weekly, setWeekly] = useState("");
  const [saving, setSaving] = useState(false);

  const [pName, setPName] = useState("");
  const [pUsername, setPUsername] = useState("");
  const [pMobile, setPMobile] = useState("");
  const [pCity, setPCity] = useState("");
  const [pGender, setPGender] = useState("");
  const [pAge, setPAge] = useState("");
  const [pHeight, setPHeight] = useState("");
  const [pWeight, setPWeight] = useState("");
  const [pGoal, setPGoal] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [reminderOn, setReminderOn] = useState(false);

  useEffect(() => {
    const g = goalsQuery.data;
    if (g) {
      setWater(String(g.waterGoalMl));
      setCalories(String(g.calorieGoal));
      setProtein(String(g.proteinGoalG));
      setSteps(String(g.stepGoal));
      setWeekly(String(g.weeklyGoal));
    }
  }, [goalsQuery.data]);

  useEffect(() => {
    const m = meQuery.data;
    if (m) {
      setPName(m.name ?? "");
      setPUsername(m.username ?? "");
      setPMobile(m.mobile ?? "");
      setPCity(m.city ?? "");
      setPGender(m.gender ?? "");
      setPAge(m.age ? String(m.age) : "");
      setPHeight(m.heightCm ? String(m.heightCm) : "");
      setPWeight(m.weightKg ? String(m.weightKg) : "");
      setPGoal(m.fitnessGoal ?? "");
    }
  }, [meQuery.data]);

  useEffect(() => {
    void areRemindersOn().then(setReminderOn);
  }, []);

  const onSaveProfile = async () => {
    if (!pName.trim()) {
      Alert.alert("Name required", "Please enter your name.");
      return;
    }
    const username = pUsername.trim().toLowerCase();
    if (username && !/^[a-z][a-z0-9._]{2,29}$/.test(username)) {
      Alert.alert(
        "Invalid username",
        "Use 3–30 characters, start with a letter, and use only letters, numbers, dots, or underscores.",
      );
      return;
    }
    const age = Number(pAge);
    const heightCm = Number(pHeight);
    const weightKg = Number(pWeight);
    const ageOk = pAge.trim() !== "" && Number.isFinite(age) && age > 0;
    const heightOk =
      pHeight.trim() !== "" && Number.isFinite(heightCm) && heightCm > 0;
    const weightOk =
      pWeight.trim() !== "" && Number.isFinite(weightKg) && weightKg > 0;
    setSavingProfile(true);
    try {
      await updateMe.mutateAsync({
        data: {
          name: pName.trim(),
          username: username || null,
          mobile: pMobile.trim(),
          city: pCity.trim(),
          gender: pGender,
          fitnessGoal: pGoal.trim(),
          ...(ageOk ? { age } : {}),
          ...(heightOk ? { heightCm } : {}),
          ...(weightOk ? { weightKg } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      await meQuery.refetch();
      Alert.alert("Saved", "Your profile has been updated.");
    } catch (err: unknown) {
      const message =
        (err as { data?: { error?: string } })?.data?.error ??
        (err as { body?: { error?: string } })?.body?.error ??
        "Could not save your profile.";
      Alert.alert("Error", message);
    } finally {
      setSavingProfile(false);
    }
  };

  const onSaveGoals = async () => {
    setSaving(true);
    try {
      await updateGoals.mutateAsync({
        data: {
          waterGoalMl: Number(water) || 0,
          calorieGoal: Number(calories) || 0,
          proteinGoalG: Number(protein) || 0,
          stepGoal: Number(steps) || 0,
          weeklyGoal: Number(weekly) || 0,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getGetTrackingSummaryQueryKey(),
      });
      await goalsQuery.refetch();
      Alert.alert("Saved", "Your goals have been updated.");
    } catch {
      Alert.alert("Error", "Could not save your goals.");
    } finally {
      setSaving(false);
    }
  };

  const onToggleReminder = async (value: boolean) => {
    if (Platform.OS === "web") {
      Alert.alert("Not available", "Reminders work on the mobile app.");
      return;
    }
    if (value) {
      const ok = await scheduleActionReminders();
      if (!ok) {
        Alert.alert(
          "Permission needed",
          "Enable notifications in your device settings to get reminders.",
        );
        return;
      }
      setReminderOn(true);
    } else {
      await cancelActionReminders();
      setReminderOn(false);
    }
  };

  const doSignOut = async () => {
    try {
      await signOut();
    } finally {
      exitGuest();
      queryClient.clear();
      resetAuthClient();
      router.replace("/(auth)/welcome");
    }
  };

  const onLogIn = () => {
    exitGuest();
    router.replace("/(auth)/sign-in");
  };

  const onSignOut = () => {
    if (Platform.OS === "web") {
      const ok =
        typeof window !== "undefined"
          ? window.confirm("Are you sure you want to log out?")
          : true;
      if (ok) void doSignOut();
      return;
    }
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => void doSignOut() },
    ]);
  };

  const me = meQuery.data;
  const name = user?.fullName ?? me?.name ?? "Athlete";
  const email =
    user?.primaryEmailAddress?.emailAddress ?? me?.email ?? "";

  return (
    <Screen contentContainerStyle={{ paddingTop: 8 }}>
      {/* Profile header — the member's own uploaded photo comes first, then
          the gym's YoActiv record photo as a fallback. Signed-in members can
          change their photo (camera or gallery) right here. */}
      <View style={styles.profileHead}>
        {!isGuest ? (
          <ProfilePhotoPicker
            avatarUrl={me?.avatarUrl || membershipQuery.data?.photoUrl || null}
            name={name}
          />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <AppText weight="700" size={28} color={colors.primaryForeground}>
              {name.charAt(0).toUpperCase()}
            </AppText>
          </View>
        )}
        <AppText weight="700" size={22} style={{ marginTop: 12 }}>
          {name}
        </AppText>
        {email ? (
          <AppText muted size={14}>
            {email}
          </AppText>
        ) : null}
      </View>

      {!isGuest ? (
        <>
          {/* Current membership plan */}
          <SectionHeader title="Membership" />
          <Card style={{ gap: 12 }}>
            {membershipQuery.isLoading ? (
              <AppText muted size={14}>
                Loading your plan…
              </AppText>
            ) : membershipQuery.data ? (
              (() => {
                const m = membershipQuery.data;
                const expiryKnown = m.expiryKnown !== false;
                const days = expiryKnown ? daysUntilIst(m.renewsOn) : null;
                const isExpired =
                  m.status === "expired" || (days !== null && days < 0);
                const soon = !isExpired && days !== null && days <= 7;
                const urgencyColor = isExpired
                  ? colors.destructive
                  : soon
                    ? colors.warning
                    : colors.foreground;
                const pillColor = isExpired
                  ? colors.destructive
                  : colors.primary;
                return (
                  <>
                    <View style={styles.switchRow}>
                      <View style={{ flex: 1 }}>
                        <AppText weight="700" size={18}>
                          {m.planName}
                        </AppText>
                        {m.branchName ? (
                          <AppText muted size={13} style={{ marginTop: 2 }}>
                            {m.branchName}
                          </AppText>
                        ) : null}
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          { backgroundColor: pillColor + "22" },
                        ]}
                      >
                        <AppText
                          size={12}
                          weight="700"
                          color={pillColor}
                          style={{ textTransform: "capitalize" }}
                        >
                          {isExpired ? "expired" : m.status}
                        </AppText>
                      </View>
                    </View>
                    <View style={styles.row2}>
                      <View style={styles.half}>
                        <AppText muted size={12}>
                          Started on
                        </AppText>
                        <AppText weight="700" size={15}>
                          {m.startedOn
                            ? istDateLabel(istDateStr(new Date(m.startedOn)))
                            : "—"}
                        </AppText>
                      </View>
                      <View style={styles.half}>
                        <AppText muted size={12}>
                          {isExpired ? "Expired on" : "Expires on"}
                        </AppText>
                        <AppText weight="700" size={15} color={urgencyColor}>
                          {expiryKnown
                            ? istDateLabel(istDateStr(new Date(m.renewsOn)))
                            : "—"}
                        </AppText>
                      </View>
                    </View>
                    {days !== null ? (
                      <View
                        style={[
                          styles.renewNote,
                          {
                            backgroundColor: isExpired
                              ? colors.destructive + "1A"
                              : soon
                                ? colors.warning + "1A"
                                : colors.muted,
                          },
                        ]}
                      >
                        <Feather
                          name={isExpired ? "alert-circle" : soon ? "clock" : "check-circle"}
                          size={14}
                          color={isExpired ? colors.destructive : soon ? colors.warning : colors.success}
                        />
                        <AppText
                          size={13}
                          weight="600"
                          color={isExpired ? colors.destructive : soon ? colors.warning : colors.foreground}
                          style={{ flex: 1 }}
                        >
                          {isExpired
                            ? "Your plan has expired — renew to keep access"
                            : days === 0
                              ? "Your plan expires today — renew to stay active"
                              : days === 1
                                ? "1 day left on your plan"
                                : `${days} days left on your plan`}
                        </AppText>
                      </View>
                    ) : null}
                    <View style={styles.row2}>
                      <View style={styles.half}>
                        <AppText muted size={12}>
                          Classes this month
                        </AppText>
                        <AppText weight="700" size={16}>
                          {m.classesUsed} / {m.classesIncluded}
                        </AppText>
                      </View>
                      <View style={styles.half}>
                        <AppText muted size={12}>
                          Gyms accessed
                        </AppText>
                        <AppText weight="700" size={16}>
                          {m.gymsAccessed}
                        </AppText>
                      </View>
                    </View>
                    <Button
                      label="Manage plan"
                      variant="secondary"
                      icon="credit-card"
                      onPress={() => router.push("/book-package")}
                    />
                  </>
                );
              })()
            ) : (
              <>
                <AppText weight="600" size={15}>
                  No active plan
                </AppText>
                <AppText muted size={13}>
                  Choose a membership to unlock gyms and classes.
                </AppText>
                <Button
                  label="View plans"
                  icon="credit-card"
                  onPress={() => router.push("/(tabs)/packages")}
                />
              </>
            )}
          </Card>

          {/* Payment / renewal history (from the gym-management system) */}
          {paymentsQuery.data && paymentsQuery.data.length > 0 ? (
            <>
              <SectionHeader
                title="Payment history"
                action="Invoices"
                onAction={() => router.push("/invoices")}
              />
              <Card style={{ gap: 0 }}>
                {paymentsQuery.data.slice(0, 10).map((p, i) => (
                  <View
                    key={`${p.billId}-${i}`}
                    style={[
                      styles.paymentRow,
                      i > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: colors.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText weight="600" size={14}>
                        {p.planName}
                      </AppText>
                      <AppText muted size={12} style={{ marginTop: 2 }}>
                        {p.invoiceDate
                          ? istDateLabel(p.invoiceDate)
                          : p.startDate
                            ? istDateLabel(p.startDate)
                            : p.branchName}
                        {p.expiryDate
                          ? ` · till ${istDateLabel(p.expiryDate)}`
                          : ""}
                      </AppText>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      {typeof p.amountInr === "number" && p.amountInr > 0 ? (
                        <AppText weight="700" size={14}>
                          ₹{p.amountInr.toLocaleString("en-IN")}
                        </AppText>
                      ) : null}
                      <AppText
                        size={11}
                        weight="700"
                        color={
                          p.status === "active"
                            ? colors.primary
                            : colors.mutedForeground
                        }
                        style={{ textTransform: "capitalize", marginTop: 2 }}
                      >
                        {p.status}
                      </AppText>
                    </View>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {/* Package purchases made in the app (online payments) */}
          {purchasesQuery.data && purchasesQuery.data.length > 0 ? (
            <>
              <SectionHeader title="Package purchases" />
              <Card style={{ gap: 0 }}>
                {purchasesQuery.data.slice(0, 10).map((b, i) => (
                  <View
                    key={b.id}
                    style={[
                      styles.paymentRow,
                      i > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: colors.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText weight="600" size={14}>
                        {b.serviceName ? `${b.serviceName} — ${b.packageName}` : b.packageName}
                      </AppText>
                      <AppText muted size={12} style={{ marginTop: 2 }}>
                        {b.gymName}
                        {b.startDate ? ` · from ${istDateLabel(b.startDate)}` : ""}
                      </AppText>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <AppText weight="700" size={14}>
                        ₹{b.amountInr.toLocaleString("en-IN")}
                      </AppText>
                      <AppText
                        size={11}
                        weight="700"
                        color={
                          b.status === "paid"
                            ? colors.primary
                            : b.status === "failed"
                              ? "#ff6b6b"
                              : colors.mutedForeground
                        }
                        style={{ textTransform: "capitalize", marginTop: 2 }}
                      >
                        {b.status}
                      </AppText>
                    </View>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {/* Personal details (manage profile) */}
          <SectionHeader title="Personal details" />
          <Card style={{ gap: 14 }}>
            <Field label="Name" value={pName} onChangeText={setPName} />
            <Field
              label="Username"
              value={pUsername}
              onChangeText={setPUsername}
              placeholder="e.g. iconic.member"
              autoCapitalize="none"
              autoComplete="username"
            />
            <Field
              label="Mobile"
              value={pMobile}
              onChangeText={setPMobile}
              keyboardType="phone-pad"
            />
            <Field label="City" value={pCity} onChangeText={setPCity} />
            <View style={{ gap: 8 }}>
              <AppText weight="600" size={13} muted>
                Gender
              </AppText>
              <ChipRow>
                {GENDER_OPTIONS.map((g) => (
                  <Chip
                    key={g}
                    label={g.charAt(0).toUpperCase() + g.slice(1)}
                    active={pGender === g}
                    onPress={() => setPGender(g)}
                  />
                ))}
              </ChipRow>
            </View>
            <View style={styles.row2}>
              <View style={styles.half}>
                <Field
                  label="Age"
                  value={pAge}
                  onChangeText={setPAge}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.half}>
                <Field
                  label="Height (cm)"
                  value={pHeight}
                  onChangeText={setPHeight}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <View style={styles.row2}>
              <View style={styles.half}>
                <Field
                  label="Weight (kg)"
                  value={pWeight}
                  onChangeText={setPWeight}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.half}>
                <Field
                  label="Fitness goal"
                  value={pGoal}
                  onChangeText={setPGoal}
                />
              </View>
            </View>
            <Button
              label="Save profile"
              onPress={onSaveProfile}
              loading={savingProfile}
            />
          </Card>
        </>
      ) : null}

      {/* Appearance */}
      <SectionHeader title="Appearance" />
      <Card style={{ gap: 14 }}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <AppText weight="600" size={15}>
              Theme
            </AppText>
            <AppText muted size={13}>
              Choose light, dark, or match your device.
            </AppText>
          </View>
        </View>
        <ChipRow>
          {THEME_OPTIONS.map((opt) => (
            <Chip
              key={opt.mode}
              label={opt.label}
              active={themeMode === opt.mode}
              onPress={() => setThemeMode(opt.mode)}
            />
          ))}
        </ChipRow>
      </Card>

      {/* Goals */}
      <SectionHeader title="Daily goals" />
      <Card style={{ gap: 14 }}>
        <View style={styles.row2}>
          <View style={styles.half}>
            <Field
              label="Water (ml)"
              value={water}
              onChangeText={setWater}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.half}>
            <Field
              label="Calories (kcal)"
              value={calories}
              onChangeText={setCalories}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <View style={styles.row2}>
          <View style={styles.half}>
            <Field
              label="Protein (g)"
              value={protein}
              onChangeText={setProtein}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.half}>
            <Field
              label="Steps"
              value={steps}
              onChangeText={setSteps}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <Field
          label="Workouts per week"
          value={weekly}
          onChangeText={setWeekly}
          keyboardType="number-pad"
        />
        <Button label="Save goals" onPress={onSaveGoals} loading={saving} />
      </Card>

      {/* Reminders */}
      <SectionHeader title="Daily reminders" />
      <Card style={{ gap: 14 }}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <AppText weight="600" size={15}>
              Daily action reminders
            </AppText>
            <AppText muted size={13}>
              Gentle nudges through the day for water, meals, your workout, steps
              and sleep.
            </AppText>
          </View>
          <Switch
            value={reminderOn}
            onValueChange={onToggleReminder}
            trackColor={{ true: colors.primary, false: colors.elevated }}
            thumbColor="#fff"
          />
        </View>
        {reminderOn ? (
          <View style={{ gap: 8 }}>
            {ACTION_REMINDERS.map((r) => (
              <View key={r.key} style={styles.reminderRow}>
                <AppText muted size={13} style={{ width: 76 }}>
                  {formatHour(r.hour, r.minute)}
                </AppText>
                <AppText size={13} style={{ flex: 1 }}>
                  {r.title}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      <View style={{ marginTop: 28 }}>
        {isGuest ? (
          <Button
            label="Log in or create account"
            onPress={onLogIn}
            icon="log-in"
          />
        ) : (
          <Button
            label="Log out"
            onPress={onSignOut}
            variant="ghost"
            icon="log-out"
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileHead: { alignItems: "center", marginBottom: 24, marginTop: 8 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  row2: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  renewNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  reminderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
