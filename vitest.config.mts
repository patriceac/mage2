import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "scripts/**/*.test.mjs",
      "scripts/**/*.test.ts"
    ]
  },
  resolve: {
    alias: {
      "@mage2/schema": path.resolve(import.meta.dirname, "packages/schema/src/index.ts"),
      "@mage2/player": path.resolve(import.meta.dirname, "packages/player/src/index.ts"),
      "@mage2/player-ui": path.resolve(import.meta.dirname, "packages/player-ui/src/index.ts"),
      "@mage2/media": path.resolve(import.meta.dirname, "packages/media/src/index.ts")
    }
  }
});
