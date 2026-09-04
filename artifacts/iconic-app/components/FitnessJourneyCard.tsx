import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListMyPtTrialFeedbackQueryKey,
  getGetMyPtProgramQueryKey,
  getListMyTrainerBookingsQueryKey,
  useGetMyPtProgram,
  useListMyPtTrialFeedback,
  useListMyTrainerBookings,
  useSubmitPtTrialFeedback,
} from "@workspace/api-client-react";
import { AppText } from "@/components/AppText";
import { useColors } from "@/hooks/useColors";
import { resolveImageUrl } from "@/lib/images";

const GOLD = "#FFCC00";
const LIME = "#0BE607";

type StepState = "done" | "current" | "upcoming";

/**
 * Home "Let's start your fitness journey" card: a 6-step kick-starter PT
 * trial flow. Steps auto-complete from real data (bookings, trainer
 * assignment, completed sessions) and the two feedback steps open a
 * star-rating modal. Hidden once the whole journey is finished.
 */
export function FitnessJourneyCard() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();

  const bookingsQuery = useListMyTrainerBookings({
    query: { queryKey: getListMyTrainerBookingsQueryKey() },
  });
  const ptQuery = useGetMyPtProgram({
    query: { queryKey: getGetMyPtProgramQueryKey() },
  });
  const feedbackQuery = useListMyPtTrialFeedback({
    query: { queryKey: getListMyPtTrialFeedbackQueryKey() },
  });
  const submitFeedback = useSubmitPtTrialFeedback();

  const [feedbackFor, setFeedbackFor] = useState<1 | 2 | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  // Wait for all three queries to settle so steps never flash wrong states.
  const settled =
    (bookingsQuery.isSuccess || bookingsQuery.isError) &&
    (ptQuery.isSuccess || ptQuery.isError) &&
    (feedbackQuery.isSuccess || feedbackQuery.isError);
  if (!settled) return null;

  const hasBooking = (bookingsQuery.data ?? []).length > 0;
  const pt = ptQuery.data;
  const assigned = !!pt?.active;
  const completed = pt?.completedCount ?? 0;
  const feedback = feedbackQuery.data ?? [];
  const fb1 = feedback.some((f) => f.sessionNo === 1);
  const fb2 = feedback.some((f) => f.sessionNo === 2);

  const doneFlags = [
    hasBooking,
    assigned,
    completed >= 1,
    fb1,
    completed >= 2,
    fb2,
  ];
  // Journey finished — the card retires from Home.
  if (doneFlags.every(Boolean)) return null;

  const currentIdx = doneFlags.findIndex((d) => !d);
  const stepState = (i: number): StepState =>
    doneFlags[i] ? "done" : i === currentIdx ? "current" : "upcoming";

  const openFeedback = (sessionNo: 1 | 2) => {
    setRating(0);
    setComment("");
    setFeedbackFor(sessionNo);
  };

  const saveFeedback = async () => {
    if (!feedbackFor || rating < 1 || saving) return;
    setSaving(true);
    try {
      await submitFeedback.mutateAsync({
        data: { sessionNo: feedbackFor, rating, comment: comment.trim() },
      });
      await queryClient.invalidateQueries({
        queryKey: getListMyPtTrialFeedbackQueryKey(),
      });
      setFeedbackFor(null);
    } catch {
      // Keep the modal open so the member can retry.
    } finally {
      setSaving(false);
    }
  };

  const trainerPhoto = assigned
    ? resolveImageUrl(pt?.trainerPhotoUrl || null)
    : null;

  const steps: {
    label: string;
    photoUrl?: string | null;
    action?: { label: string; onPress: () => void };
  }[] = [
    {
      label: "Book your kick-starter PT trial session",
      action: !hasBooking
        ? { label: "Book now", onPress: () => router.push("/trainers") }
        : undefined,
    },
    {
      label: assigned
        ? `Accepted by ${pt?.trainerName ?? "your trainer"}`
        : "Trainer assignment",
      photoUrl: trainerPhoto,
    },
    { label: "First trial session" },
    {
      label: "Session feedback",
      action:
        completed >= 1 && !fb1
          ? { label: "Give feedback", onPress: () => openFeedback(1) }
          : undefined,
    },
    { label: "Second trial session" },
    {
      label: "Second session feedback",
      action:
        completed >= 2 && !fb2
          ? { label: "Give feedback", onPress: () => openFeedback(2) }
          : undefined,
    },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerIcon}>
          <Feather name="zap" size={16} color="#0A0C08" />
        </View>
        <AppText size={17} weight="700" color={colors.foreground} style={{ flex: 1 }}>
          Let's start your fitness journey
        </AppText>
      </View>

      {steps.map((step, i) => {
        const state = stepState(i);
        const isLast = i === steps.length - 1;
        return (
          <View key={i} style={styles.stepRow}>
            <View style={styles.railCol}>
              <View
                style={[
                  styles.dot,
                  state === "done"
                    ? { backgroundColor: LIME, borderColor: LIME }
                    : state === "current"
                      ? { backgroundColor: "transparent", borderColor: GOLD }
                      : { backgroundColor: "transparent", borderColor: colors.border },
                ]}
              >
                {state === "done" ? (
                  <Feather name="check" size={11} color="#0A0C08" />
                ) : null}
              </View>
              {!isLast ? (
                <View
                  style={[
                    styles.rail,
                    { backgroundColor: doneFlags[i] ? LIME : colors.border },
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.stepBody}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {step.photoUrl ? (
                  <Image
                    source={{ uri: step.photoUrl }}
                    style={styles.trainerAvatar}
                  />
                ) : null}
                <AppText
                  size={14}
                  weight={state === "current" ? "700" : "600"}
                  color={
                    state === "upcoming" ? colors.mutedForeground : colors.foreground
                  }
                  style={{ flex: 1 }}
                >
                  {step.label}
                </AppText>
              </View>
              {state !== "done" && step.action ? (
                <Pressable onPress={step.action.onPress}>
                  {({ pressed }) => (
                    <View style={[styles.actionBtn, { opacity: pressed ? 0.8 : 1 }]}>
                      <AppText size={13} weight="700" color="#0A0C08">
                        {step.action!.label}
                      </AppText>
                      <Feather name="arrow-right" size={14} color="#0A0C08" />
                    </View>
                  )}
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}

      {/* ── Feedback modal ── */}
      <Modal
        visible={feedbackFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedbackFor(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <AppText size={17} weight="700" color={colors.foreground}>
              {feedbackFor === 2 ? "Second trial session" : "Trial session"} feedback
            </AppText>
            <AppText size={13} color={colors.mutedForeground} style={{ marginTop: 4 }}>
              How was your session?
            </AppText>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
                  <Feather
                    name="star"
                    size={30}
                    color={n <= rating ? GOLD : colors.border}
                  />
                </Pressable>
              ))}
            </View>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Anything you'd like to share? (optional)"
              placeholderTextColor={colors.mutedForeground}
              multiline
              style={[
                styles.commentInput,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                },
              ]}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setFeedbackFor(null)} disabled={saving}>
                {({ pressed }) => (
                  <View style={[styles.modalBtnGhost, { opacity: pressed ? 0.7 : 1, borderColor: colors.border }]}>
                    <AppText size={14} weight="700" color={colors.mutedForeground}>
                      Cancel
                    </AppText>
                  </View>
                )}
              </Pressable>
              <Pressable onPress={saveFeedback} disabled={rating < 1 || saving}>
                {({ pressed }) => (
                  <View
                    style={[
                      styles.modalBtnPrimary,
                      { opacity: rating < 1 || saving ? 0.5 : pressed ? 0.8 : 1 },
                    ]}
                  >
                    <AppText size={14} weight="700" color="#0A0C08">
                      {saving ? "Saving…" : "Submit"}
                    </AppText>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: LIME,
    alignItems: "center",
    justifyContent: "center",
  },
  stepRow: {
    flexDirection: "row",
    gap: 12,
  },
  railCol: {
    alignItems: "center",
    width: 22,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  rail: {
    width: 2,
    flex: 1,
    minHeight: 14,
    marginVertical: 2,
  },
  stepBody: {
    flex: 1,
    paddingBottom: 16,
  },
  trainerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: LIME,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: LIME,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginTop: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  starsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    marginBottom: 14,
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 76,
    textAlignVertical: "top",
    fontSize: 14,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
  modalBtnGhost: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  modalBtnPrimary: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: LIME,
  },
});
