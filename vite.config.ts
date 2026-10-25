import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Release validation uses an empty, dedicated env directory so Vite cannot
  // load an ignored root .env.local. Browser variables are supplied explicitly
  // by the validation runner instead.
  envDir: mode === "static-validation"
    ? path.resolve(__dirname, ".env-static-validation")
    : undefined,
  server: {
    // Vite's development server is not a production boundary. Bind locally
    // by default; an explicit DEV_SERVER_HOST opt-in is required for containers
    // or trusted LAN testing.
    host: process.env.DEV_SERVER_HOST || "127.0.0.1",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: process.env.PREVIEW_SERVER_HOST || "127.0.0.1",
    port: Number(process.env.PORT) || 4173,
    strictPort: true,
    allowedHosts: ["authority-lab-website-production.up.railway.app"],
  },
  build: {
    // scripts/prerender-marketing.mjs reads the manifest to link each
    // prerendered page's stylesheets and chunks, then deletes it from dist.
    manifest: true,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
