import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Plugin } from "vite";
const pwaVersion: Plugin = {
  name: 'domicares-pwa-version',
  writeBundle(options, bundle) {
    const file = path.resolve(options.dir || 'dist', 'sw.js');
    const hash = createHash('sha256').update(Object.keys(bundle).sort().join('\n'));
    for (const publicFile of ['sw.js', 'offline.html', 'manifest.webmanifest', 'pwa/icon-192.png', 'pwa/icon-512.png', 'pwa/icon-maskable.png', 'pwa/apple-touch-icon.png']) {
      hash.update(readFileSync(path.resolve('public', publicFile)));
    }
    const version = hash.digest('hex').slice(0, 16);
    writeFileSync(file, readFileSync(file, 'utf8').replace('__BUILD_VERSION__', version));
  },
};

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
  // Le navigateur PWA utilise le vrai transport HTTP, sans interception Playwright.
  // En preview de test seulement, empêcher le chargement des services externes.
  preview: {
    headers: process.env.DOMICARES_BROWSER_TEST === '1'
      ? { 'Content-Security-Policy': "script-src 'self'; connect-src 'self'" }
      : undefined,
  },
  plugins: [react(), pwaVersion],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Optimisations de build
    target: ["safari16.4", "chrome111", "edge111", "firefox128"],
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
