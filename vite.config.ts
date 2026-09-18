import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // API NestJS locale (npm run start:dev dans api/) : même origine pour les cookies httpOnly
    proxy: {
      "/api": { target: process.env.VITE_DEV_API_TARGET || "http://localhost:3000", changeOrigin: true },
      "/socket.io": { target: process.env.VITE_DEV_API_TARGET || "http://localhost:3000", ws: true, changeOrigin: true },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Optimisations de build
    target: "esnext",
    minify: "esbuild",
    sourcemap: false,
    // Code splitting manuel pour réduire la taille du bundle initial
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - bibliothèques tierces
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-select", "@radix-ui/react-tabs", "@radix-ui/react-toast"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
          // Charts et visualisations (chargés à la demande)
          "vendor-charts": ["recharts"],
        },
      },
    },
    // Limite de taille des chunks
    chunkSizeWarningLimit: 500,
  },
  // Optimisation des dépendances
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
    ],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["legacy/**"],
  },
}));
