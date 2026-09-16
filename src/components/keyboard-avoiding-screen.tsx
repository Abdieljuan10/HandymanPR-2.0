import type { PropsWithChildren } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

// RN's KeyboardAvoidingView needs an explicit behavior on Android too — a
// bare `undefined` there (the old default in this codebase) makes it a
// no-op, and Android's own adjustResize doesn't kick in under edge-to-edge,
// so the keyboard just covers whatever's focused. 'height' is the standard
// Android fix; iOS keeps 'padding' since 'height' fights the safe area there.
export function KeyboardAvoidingScreen({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
