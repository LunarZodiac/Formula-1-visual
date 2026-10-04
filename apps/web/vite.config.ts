import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  return {
    css: {
      postcss: {
        plugins: [tailwindcss()],
      },
    },

    optimizeDeps: {
      exclude: ['maplibre-gl'],
    },

    server: {
      host: '127.0.0.1',
      port: 3000,

      ...(isCodexSeatbeltSandbox
        ? {
            watch: {
              useFsEvents: false,
              usePolling: true,
            },
          }
        : {}),
    },

    plugins: [
      vinext(),

      cloudflare({
        viteEnvironment: {
          name: 'rsc',
          childEnvironments: ['ssr'],
        },
        config: {
          main: 'vinext/server/app-router-entry',
        },
      }),
    ],
  };
});