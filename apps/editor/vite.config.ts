import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@mage2/schema": path.resolve(__dirname, "../../packages/schema/src/index.ts"),
      "@mage2/player": path.resolve(__dirname, "../../packages/player/src/index.ts"),
      "@mage2/media": path.resolve(__dirname, "../../packages/media/src/index.ts")
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "dist"
  }
});
