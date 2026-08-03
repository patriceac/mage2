import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const normalizeModuleId = (id: string) => id.replaceAll("\\", "/");

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@mage2/schema": path.resolve(__dirname, "../../packages/schema/src/index.ts"),
      "@mage2/player": path.resolve(__dirname, "../../packages/player/src/index.ts"),
      "@mage2/player-ui/styles.css": path.resolve(__dirname, "../../packages/player-ui/src/styles.css"),
      "@mage2/player-ui": path.resolve(__dirname, "../../packages/player-ui/src/index.ts"),
      "@mage2/media": path.resolve(__dirname, "../../packages/media/src/index.ts")
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = normalizeModuleId(id);

          if (
            moduleId.includes("/node_modules/react/") ||
            moduleId.includes("/node_modules/react-dom/") ||
            moduleId.includes("/node_modules/scheduler/")
          ) {
            return "vendor-react";
          }

          if (moduleId.includes("/node_modules/zustand/")) {
            return "vendor-state";
          }

          if (
            moduleId.includes("/packages/schema/src/") ||
            moduleId.includes("/packages/player/src/") ||
            moduleId.includes("/packages/player-ui/src/")
          ) {
            return "mage2-core";
          }
        }
      }
    }
  }
});
