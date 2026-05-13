/**
 * Vitest config for the mobile package.
 *
 * Scope: pure-logic + AuthContext-style hook tests that don't need a real
 * React Native runtime. RN component rendering (e.g. <View>, <Text>) is
 * NOT supported here — that needs jest-expo + react-test-renderer in a
 * separate suite.
 *
 * jsdom is enabled so React + @testing-library/react can mount providers
 * and run effects against a DOM. expo-secure-store is mocked in
 * `tests/setup.ts` so the SecureStore-backed token store is exercisable
 * without the native module.
 */
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../src/lib"),
    },
  },
});
