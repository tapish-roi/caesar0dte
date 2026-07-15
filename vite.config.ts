import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => ({
  // GitHub Pages serves this project site under /caesar0dte/. Only apply the
  // sub-path for production builds; local dev stays at root.
  base: command === "build" ? "/caesar0dte/" : "/",
  server: {
    host: "::",
    // Defaults to 8080; PORT lets a second instance run alongside the first.
    port: Number(process.env.PORT) || 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
