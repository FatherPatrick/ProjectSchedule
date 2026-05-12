/**
 * Screen wrapper: applies safe-area insets (top by default; tab screens skip
 * bottom because the tab bar already reserves it). Provides a consistent
 * background and full-height container.
 */
import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Edges = ("top" | "bottom" | "left" | "right")[];

export function Screen({
  children,
  edges = ["top", "left", "right"],
  style,
  background = "#fafafa",
}: {
  children: ReactNode;
  edges?: Edges;
  style?: ViewStyle;
  background?: string;
}) {
  return (
    <SafeAreaView
      edges={edges}
      style={[styles.root, { backgroundColor: background }, style]}
    >
      <View style={styles.inner}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: { flex: 1 },
});
