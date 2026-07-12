import { defineConfig, loadEnv, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

function versionFilePlugin(version: string): Plugin {
  const source = JSON.stringify({ version });

  return {
    name: 'app-version-file',
    configureServer(server) {
      server.middlewares.use('/version.json', (_request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(source);
      });
    },
    generateBundle() {
      this.emitFile({
        fileName: 'version.json',
        source,
        type: 'asset',
      });
    },
  };
}

const APP_NAME = 'Novae';

function htmlEnvPlugin(appVersion: string): Plugin {
  return {
    name: 'app-html-env',
    transformIndexHtml(html) {
      return html
        .replaceAll('%APP_NAME%', APP_NAME)
        .replaceAll('%APP_VERSION%', appVersion);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appVersion = env.VITE_APP_VERSION
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.GITHUB_SHA
    || process.env.npm_package_version
    || 'development';

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [
      htmlEnvPlugin(appVersion),
      versionFilePlugin(appVersion),
      vue(),
      tailwindcss(),
      VitePWA({
        filename: 'sw.ts',
        injectRegister: false,
        registerType: 'autoUpdate',
        srcDir: 'src',
        strategies: 'injectManifest',
        manifest: {
          name: APP_NAME,
          short_name: APP_NAME,
          description: '讓每一個學生的提案與倡議匯聚成改變校園的力量',
          lang: 'zh-Hant',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          display_override: ['standalone'],
          orientation: 'portrait-primary',
          background_color: '#f7f7f3',
          theme_color: '#f7f7f3',
          icons: [
            {
              src: `pwa-64x64.png?v=${appVersion}`,
              sizes: '64x64',
              type: 'image/png',
            },
            {
              src: `pwa-192x192.png?v=${appVersion}`,
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: `pwa-512x512.png?v=${appVersion}`,
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: `maskable-icon-512x512.png?v=${appVersion}`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        injectManifest: {
          globIgnores: [
            'assets/firebase-app-check-*.js',
            'assets/firebase-messaging-*.js',
          ],
          globPatterns: [
            'index.html',
            'manifest.webmanifest',
            'assets/**/*.{js,css,wasm,woff2}',
            '*.{png,ico}',
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          chunkFileNames(chunkInfo) {
            if (chunkInfo.moduleIds.some((id) => id.includes('node_modules/@firebase/messaging/') || id.includes('node_modules/firebase/messaging/'))) {
              return 'assets/firebase-messaging-[hash].js';
            }
            if (chunkInfo.moduleIds.some((id) => id.includes('node_modules/@firebase/app-check/') || id.includes('node_modules/firebase/app-check/'))) {
              return 'assets/firebase-app-check-[hash].js';
            }
            return 'assets/[name]-[hash].js';
          },
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('node_modules/@firebase/messaging/') || id.includes('node_modules/firebase/messaging/')) {
                return;
              }
              if (id.includes('node_modules/@firebase/app-check/') || id.includes('node_modules/firebase/app-check/')) {
                return;
              }
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              return 'vendor';
            }
          },
        },
      },
    },
  };
});
