import { Feather } from "@expo/vector-icons";
import { forwardRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

import { AppText } from "@/components/AppText";
import { useColors } from "@/hooks/useColors";

type Props = TextInputProps & {
  label?: string;
  hint?: string;
};

export const Field = forwardRef<TextInput, Props>(function Field(
  {
    label,
    hint,
    style,
    secureTextEntry = false,
    textContentType,
    autoComplete,
    autoCorrect,
    spellCheck,
    ...rest
  },
  ref,
) {
  const colors = useColors();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = Boolean(secureTextEntry);

  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText weight="600" size={13} muted>
          {label}
        </AppText>
      ) : null}
      <View style={styles.inputWrap}>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          secureTextEntry={isPassword && !passwordVisible}
          textContentType={textContentType ?? (isPassword ? "password" : undefined)}
          autoComplete={autoComplete ?? (isPassword ? "password" : undefined)}
          autoCorrect={autoCorrect ?? (isPassword ? false : undefined)}
          spellCheck={spellCheck ?? (isPassword ? false : undefined)}
          style={[
            styles.input,
            isPassword && styles.passwordInput,
            {
              backgroundColor: colors.input,
              borderColor: colors.border,
              borderRadius: 16,
              color: colors.foreground,
              // iPadOS secure TextInput can fail to paint password bullets when
              // a bundled custom font is forced. Passwords use the native
              // system font so every keystroke has visible feedback.
              fontFamily: isPassword ? undefined : "Inter_500Medium",
              borderWidth: 1,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
            },
            style,
          ]}
          {...rest}
        />
        {isPassword ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
            hitSlop={10}
            onPress={() => setPasswordVisible((visible) => !visible)}
            style={styles.passwordToggle}
          >
            <Feather
              name={passwordVisible ? "eye-off" : "eye"}
              size={20}
              color={colors.mutedForeground}
            />
          </Pressable>
        ) : null}
      </View>
      {hint ? (
        <AppText size={11} muted>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  inputWrap: { position: "relative" },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 15,
  },
  passwordInput: { paddingRight: 52 },
  passwordToggle: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    position: "absolute",
    right: 0,
    top: 0,
    width: 50,
  },
});
