import { Feather } from "@expo/vector-icons";
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/**
 * Native branch-tour preview.
 *
 * YouTube rejects playback inside some embedded iOS/Android WebViews with
 * player error 152. Native builds therefore show YouTube's thumbnail and let
 * the parent Pressable open the real video in YouTube or the system browser.
 * Expo web keeps the inline iframe implementation in YouTubeInline.web.tsx.
 */
export function YouTubeInline({
  videoId,
  style,
}: {
  videoId: string;
  active?: boolean;
  loop?: boolean;
  onEnded?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.container, style]} pointerEvents="none">
      <Image
        source={{
          uri: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <View style={styles.scrim} />
      <View style={styles.playButton}>
        <Feather name="play" size={30} color="#FFFFFF" />
      </View>
      <View style={styles.label}>
        <Text style={styles.labelText}>WATCH ON YOUTUBE</Text>
        <Feather name="external-link" size={13} color="#FFFFFF" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  playButton: {
    width: 66,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
    backgroundColor: "#FF0000",
  },
  label: {
    position: "absolute",
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  labelText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
});