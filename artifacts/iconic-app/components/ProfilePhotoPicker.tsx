import { Feather } from "@expo/vector-icons";
import { customFetch, getGetMeQueryKey, useUpdateMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, View } from "react-native";

import { AppText } from "@/components/AppText";
import { useColors } from "@/hooks/useColors";
import { resolveImageUrl } from "@/lib/images";

function notify(title: string, message: string) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    window.alert(`${title}\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

/**
 * Permission-denied alert. On native, when the OS won't re-prompt
 * (user previously tapped "Don't Allow"), offer an "Open Settings" button
 * that deep-links to the app's entry in system Settings.
 */
function notifyPermissionDenied(message: string, canAskAgain: boolean) {
  if (Platform.OS === "web") {
    notify("Permission needed", message);
    return;
  }
  if (canAskAgain) {
    Alert.alert("Permission needed", message);
    return;
  }
  Alert.alert(
    "Permission needed",
    `${message} Access was previously denied, so please enable it in Settings.`,
    [
      { text: "Not now", style: "cancel" },
      {
        text: "Open Settings",
        onPress: () => void Linking.openSettings(),
      },
    ],
  );
}

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.7,
};

/**
 * Member profile photo: shows the current photo (or an initial) with
 * "Camera" / "Gallery" actions. The picked image is uploaded to the server
 * (compressed there), saved as the member's avatar, and synced everywhere
 * the member's photo is shown (member card, account page).
 */
/**
 * Shared profile-photo upload logic (camera / gallery / upload / retry) so any
 * avatar in the app (profile page, member card) can change the photo.
 */
export function useProfilePhotoUpload() {
  const queryClient = useQueryClient();
  const updateMe = useUpdateMe();
  const [busy, setBusy] = useState(false);
  // Show the fresh photo immediately after upload (before the /me refetch).
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  // Remember the last picked image if its upload failed, so the member can
  // retry without re-picking the photo (important on flaky gym connections).
  const [failedUri, setFailedUri] = useState<string | null>(null);

  const UPLOAD_TIMEOUT_MS = 30_000;

  async function uploadFromUri(uri: string) {
    setBusy(true);
    setFailedUri(null);
    // Abort the upload if it stalls (slow/dead mobile connection) so the
    // spinner never hangs indefinitely.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
      const fetched = await fetch(uri);
      const blob = await fetched.blob();
      const uploaded = await customFetch<{ url: string }>(
        "/api/storage/uploads/inline",
        {
          method: "POST",
          body: blob,
          signal: controller.signal,
          headers: {
            "x-filename": "profile-photo.jpg",
            "content-type": "application/octet-stream",
          },
        },
      );
      await updateMe.mutateAsync({ data: { avatarUrl: uploaded.url } });
      setLocalUrl(resolveImageUrl(uploaded.url) ?? null);
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (err) {
      setFailedUri(uri);
      const aborted =
        controller.signal.aborted ||
        (err instanceof Error && err.name === "AbortError");
      notify(
        "Photo not saved",
        aborted
          ? "Upload timed out — check your connection and tap Retry."
          : err instanceof Error && err.message
            ? err.message
            : "Please try again.",
      );
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  async function pickFromGallery() {
    // Android's system Photo Picker grants access only to the image selected by
    // the user, so broad READ_MEDIA_* permissions are neither needed nor
    // permitted by Google Play for this occasional profile-photo use case.
    if (Platform.OS === "ios") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notifyPermissionDenied("Allow photo access to choose a picture.", perm.canAskAgain);
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    const uri = result.canceled ? null : result.assets?.[0]?.uri;
    if (uri) await uploadFromUri(uri);
  }

  async function takePhoto() {
    // Camera capture isn't available in web browsers via expo-image-picker;
    // fall back to the file picker there (mobile browsers offer the camera).
    if (Platform.OS === "web") {
      await pickFromGallery();
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      notifyPermissionDenied("Allow camera access to take your photo.", perm.canAskAgain);
      return;
    }
    const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    const uri = result.canceled ? null : result.assets?.[0]?.uri;
    if (uri) await uploadFromUri(uri);
  }

  /** Ask Camera-or-Gallery in one tap (used by tappable avatars). */
  function choosePhoto() {
    if (Platform.OS === "web") {
      void pickFromGallery();
      return;
    }
    Alert.alert("Change profile photo", "Where do you want to pick it from?", [
      { text: "Camera", onPress: () => void takePhoto() },
      { text: "Gallery", onPress: () => void pickFromGallery() },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  return {
    busy,
    localUrl,
    failedUri,
    uploadFromUri,
    pickFromGallery,
    takePhoto,
    choosePhoto,
  };
}

export function ProfilePhotoPicker({
  avatarUrl,
  name,
  size = 96,
}: {
  avatarUrl?: string | null;
  name?: string;
  size?: number;
}) {
  const colors = useColors();
  const {
    busy,
    localUrl,
    failedUri,
    uploadFromUri,
    pickFromGallery,
    takePhoto,
  } = useProfilePhotoUpload();

  const shownUrl = localUrl ?? (avatarUrl ? resolveImageUrl(avatarUrl) : undefined);
  const initial = (name ?? "").trim().charAt(0).toUpperCase() || "?";

  return (
    <View style={{ alignItems: "center", gap: 10 }}>
      <View>
        {shownUrl ? (
          <Image
            source={{ uri: shownUrl }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
          />
        ) : (
          <View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AppText weight="700" size={size * 0.34} color={colors.primaryForeground}>
              {initial}
            </AppText>
          </View>
        )}
        {busy ? (
          <View
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: size / 2,
              backgroundColor: "rgba(0,0,0,0.45)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
      </View>
      {failedUri && !busy ? (
        <Pressable
          onPress={() => void uploadFromUri(failedUri)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: colors.primary,
          }}
        >
          <Feather name="refresh-cw" size={15} color={colors.primaryForeground} />
          <AppText weight="600" size={13} color={colors.primaryForeground}>
            Retry upload
          </AppText>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => void takePhoto()}
          disabled={busy}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            opacity: busy ? 0.5 : 1,
          }}
        >
          <Feather name="camera" size={15} color={colors.foreground} />
          <AppText weight="600" size={13}>
            Camera
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => void pickFromGallery()}
          disabled={busy}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            opacity: busy ? 0.5 : 1,
          }}
        >
          <Feather name="image" size={15} color={colors.foreground} />
          <AppText weight="600" size={13}>
            Gallery
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
