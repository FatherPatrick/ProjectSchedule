import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // Node is the default; UI tests opt into jsdom via a
    // `// @vitest-environment jsdom` docblock at the top of the file.
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: false,
  },
});
