import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@mage2/player-ui/styles.css": path.resolve(__dirname, "../../packages/player-ui/src/styles.css"),
      "@mage2/player-ui": path.resolve(__dirname, "../../packages/player-ui/src/index.ts")
    }
  },
  server: {
    port: 4173,
    strictPort: true
  },
  build: {
    outDir: "dist"
  }
});
