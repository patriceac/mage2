import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.mjs", "scripts/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@mage2/schema": path.resolve(__dirname, "packages/schema/src/index.ts"),
      "@mage2/player": path.resolve(__dirname, "packages/player/src/index.ts"),
      "@mage2/media": path.resolve(__dirname, "packages/media/src/index.ts")
    }
  }
});
