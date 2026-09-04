import * as AppleAuthentication from "expo-apple-authentication";
import { StyleSheet, View } from "react-native";

import type { AppleSsoButtonProps } from "@/components/AppleSsoButton";

export function AppleSsoButton({
  onPress,
  loading,
  disabled,
  tone = "dark",
}: AppleSsoButtonProps) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <View
      pointerEvents={isDisabled ? "none" : "auto"}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      style={[styles.wrapper, isDisabled && styles.disabled]}
    >
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={
          AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
        }
        buttonStyle={
          tone === "dark"
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={28}
        style={styles.button}
        onPress={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: "stretch",
    borderRadius: 28,
    overflow: "hidden",
  },
  button: {
    width: "100%",
    height: 56,
  },
  disabled: {
    opacity: 0.5,
  },
});