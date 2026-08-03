import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { EDITOR_DEVELOPMENT_CSP, EDITOR_PRODUCTION_CSP } from "./csp.js";

const normalizeModuleId = (id: string) => id.replaceAll("\\", "/");

export default defineConfig(({ command }) => ({
  base: "./",
  plugins: [
    react(),
    {
      name: "mage2-editor-csp",
      transformIndexHtml(html) {
        return html.replace(
          "__MAGE2_EDITOR_CSP__",
          command === "serve" ? EDITOR_DEVELOPMENT_CSP : EDITOR_PRODUCTION_CSP
        );
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@mage2/schema": path.resolve(import.meta.dirname, "../../packages/schema/src/index.ts"),
      "@mage2/player": path.resolve(import.meta.dirname, "../../packages/player/src/index.ts"),
      "@mage2/media": path.resolve(import.meta.dirname, "../../packages/media/src/index.ts")
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

          if (moduleId.includes("/packages/schema/src/") || moduleId.includes("/packages/player/src/")) {
            return "mage2-core";
          }
        }
      }
    }
  }
}));
