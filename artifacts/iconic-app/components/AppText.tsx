import { Text, type TextProps } from "react-native";

import { useColors } from "@/hooks/useColors";

type Weight = "400" | "500" | "600" | "700";

const FONT: Record<Weight, string> = {
  "400": "Inter_400Regular",
  "500": "Inter_500Medium",
  "600": "Inter_600SemiBold",
  "700": "Inter_700Bold",
};

type Props = TextProps & {
  weight?: Weight;
  size?: number;
  color?: string;
  muted?: boolean;
};

export function AppText({
  weight = "400",
  size = 15,
  color,
  muted,
  style,
  ...rest
}: Props) {
  const colors = useColors();

  // Apply a subtle premium negative tracking to larger headers
  const tracking = size >= 20 ? -0.5 : size >= 16 ? -0.2 : 0;

  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: FONT[weight],
          fontSize: size,
          letterSpacing: tracking,
          color: color ?? (muted ? colors.mutedForeground : colors.foreground),
          lineHeight: size * 1.35,
        },
        style,
      ]}
    />
  );
}
