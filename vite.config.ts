/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Adds <link rel="preconnect"> to the Supabase origin so the TLS handshake overlaps the JS download
 * (the first thing the app does is restore the session / load the profile). Skipped when the URL
 * is missing or still the .env.example placeholder.
 */
function supabasePreconnect(url: string | undefined): Plugin {
  let origin: string | null = null;
  try {
    if (url && !url.includes('<')) origin = new URL(url).origin;
  } catch {
    origin = null;
  }
  return {
    name: 'fitora-supabase-preconnect',
    transformIndexHtml() {
      if (!origin) return [];
      return [
        { tag: 'link', attrs: { rel: 'preconnect', href: origin, crossorigin: '' }, injectTo: 'head-prepend' },
        { tag: 'link', attrs: { rel: 'dns-prefetch', href: origin }, injectTo: 'head-prepend' },
      ];
    },
  };
}

// base './' — GitHub Pages serves the app from /<repo>/; HashRouter keeps routes in the hash.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: './',
    plugins: [react(), supabasePreconnect(env.VITE_SUPABASE_URL)],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // Pre-transform the entry and lazy pages on dev start so the first e2e run doesn't hit a cold compile.
    server: {
      warmup: { clientFiles: ['./src/main.tsx', './src/features/**/*Page.tsx'] },
    },
    build: {
      target: 'es2021',
      chunkSizeWarningLimit: 600,
      rolldownOptions: {
        output: {
          // Stable vendor chunks: they survive app-only deploys in the browser cache, and app code
          // (Button, services…) no longer gets hoisted into one big mixed "Button-*.js" chunk.
          // `charts` is only reachable through the lazy Reports/Body pages, so it never loads on
          // the initial route.
          codeSplitting: {
            groups: [
              {
                name: 'react', // + clsx: shared by app code and recharts — keep it out of the lazy charts chunk
                test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run|clsx)[\\/]/,
                priority: 30,
              },
              {
                // One chunk for all lucide icons: tree-shaken per-icon modules otherwise become
                // ~37 sub-1KB chunks (one request + modulepreload each) shared across the lazy pages.
                name: 'icons',
                test: /node_modules[\\/]lucide-react[\\/]/,
                priority: 25,
              },
              {
                name: 'supabase',
                test: /node_modules[\\/](@supabase|iceberg-js|tslib)[\\/]/,
                priority: 20,
              },
              {
                name: 'charts',
                test: /node_modules[\\/](recharts|recharts-scale|react-smooth|victory-vendor|d3-[^\\/]+|internmap|lodash|decimal\.js-light|fast-equals|eventemitter3|tiny-invariant|react-is|prop-types)[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  };
});
