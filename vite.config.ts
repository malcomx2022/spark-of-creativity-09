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

// Sonde de panne réseau réservée au serveur de recette Playwright.
// WebKit setOffline interrompt la navigation avant le traitement du service worker.
const browserNetworkFailure: Plugin = {
  name: 'browser-network-failure',
  configurePreviewServer(server) {
    if (process.env.DOMICARES_BROWSER_TEST !== '1') return;
    server.middlewares.use((request, _response, next) => {
      const url = new URL(request.url || '/', 'http://localhost');
      if (url.searchParams.get('__browser_network_failure') === '1') {
        request.socket.destroy();
        return;
      }
      next();
    });
  },
};

// Budget des chunks après minification. mapbox-gl (1,9 Mo minifié, indivisible) n'est chargé
// qu'à l'affichage de la carte (LazyPractitionerMap) : il a son chunk et son propre budget ;
// tout autre chunk au-delà de 500 ko reste signalé, comme le faisait chunkSizeWarningLimit.
const CHUNK_BUDGET_KB = 500;
const CHUNK_BUDGETS_KB: Record<string, number> = { 'vendor-map': 2100 };
const chunkBudget: Plugin = {
  name: 'domicares-chunk-budget',
  apply: 'build',
  generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type !== 'chunk') continue;
      const sizeKb = Buffer.byteLength(output.code) / 1000;
      const budgetKb = CHUNK_BUDGETS_KB[output.name] ?? CHUNK_BUDGET_KB;
      if (sizeKb > budgetKb) this.warn(`chunk ${output.fileName} : ${sizeKb.toFixed(0)} ko, au-delà du budget de ${budgetKb} ko (import() dynamique ou manualChunks)`);
    }
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
  plugins: [react(), pwaVersion, browserNetworkFailure, chunkBudget],
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
          // Carte (chargée à la demande par LazyPractitionerMap)
          "vendor-map": ["mapbox-gl"],
        },
      },
      onwarn(warning, warn) {
        // zod 4 place des commentaires @__PURE__ que Rollup ne sait pas rattacher : il les retire,
        // sans effet sur le code produit. Les autres avertissements restent affichés.
        if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('/node_modules/zod/')) return;
        warn(warning);
      },
    },
    // Remplacé par le plugin chunkBudget (budget par chunk) : seuil global au-dessus de tout budget.
    chunkSizeWarningLimit: 2100,
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
