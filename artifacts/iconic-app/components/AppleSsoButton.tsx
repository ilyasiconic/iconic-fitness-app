export type AppleSsoButtonProps = {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: "dark" | "light";
};

// Apple authentication is offered only on iOS. Metro resolves the native,
// App Review-compliant implementation from AppleSsoButton.ios.tsx.
export function AppleSsoButton(_props: AppleSsoButtonProps) {
  return null;
}