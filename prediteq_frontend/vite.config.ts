import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "127.0.0.1",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("react-router-dom")) return "router";
          if (id.includes("@supabase/supabase-js")) return "supabase";
          if (id.includes("@tanstack/react-query")) return "query";
          if (
            id.includes("react-hook-form") ||
            id.includes("@hookform/resolvers") ||
            id.includes("/zod/")
          ) {
            return "forms";
          }
          if (id.includes("date-fns") || id.includes("react-day-picker")) {
            return "date-utils";
          }
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("recharts")) return "charts";
          if (id.includes("leaflet")) return "maps";
          if (
            id.includes("@radix-ui") ||
            id.includes("cmdk") ||
            id.includes("embla-carousel-react") ||
            id.includes("sonner") ||
            id.includes("vaul")
          ) {
            return "ui";
          }

          return "vendor";
        },
      },
    },
  },
}));
