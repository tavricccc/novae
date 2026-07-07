/// <reference lib="webworker" />

import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute, setCatchHandler } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<unknown>;
};

const firebaseConfig = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY ?? ''),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID ?? ''),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? ''),
  messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? ''),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? ''),
};

function hasFirebaseMessagingConfig() {
  return Boolean(
    firebaseConfig.apiKey
    && firebaseConfig.appId
    && firebaseConfig.messagingSenderId
    && firebaseConfig.projectId,
  );
}

function normalizeNotificationLink(value: unknown) {
  const fallback = new URL('/', self.location.origin).href;
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }
  try {
    return new URL(value, self.location.origin).href;
  } catch {
    return fallback;
  }
}

function withAppVersion(path: string) {
  return `${path}?v=${encodeURIComponent(__APP_VERSION__)}`;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawLink = event.notification.data?.link || event.notification.data?.FCM_MSG?.data?.link;
  const link = normalizeNotificationLink(rawLink);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const matchingWindow = windows.find((client) => client.url === link);
    if (matchingWindow) {
      await matchingWindow.focus();
      return;
    }
    await self.clients.openWindow(link);
  })());
});

if (hasFirebaseMessagingConfig()) {
  void Promise.all([
    import('firebase/app'),
    import('firebase/messaging/sw'),
  ]).then(([firebaseApp, firebaseMessaging]) => {
    const app = firebaseApp.initializeApp(firebaseConfig);
    const messaging = firebaseMessaging.getMessaging(app);
    firebaseMessaging.onBackgroundMessage(messaging, (payload) => {
      // If the payload contains a notification block, FCM/browser displays it natively.
      // Do not call showNotification to avoid duplicate notifications on the device.
      if (payload.notification) {
        return;
      }
      const title = payload.data?.title ?? '收到新通知';
      const body = payload.data?.body ?? '';
      const link = payload.data?.link ?? '/';
      return self.registration.showNotification(title, {
        badge: withAppVersion('/pwa-64x64.png'),
        body,
        data: { link },
        icon: withAppVersion('/pwa-192x192.png'),
      });
    });
  }).catch(() => {});
}

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const networkOnly = new NetworkOnly();
const navigationCacheName = `navigation-${__APP_VERSION__}`;
const staticAssetCacheName = `static-assets-${__APP_VERSION__}`;
const fontStyleCacheName = `font-styles-${__APP_VERSION__}`;
const fontFileCacheName = `font-files-${__APP_VERSION__}`;
const cloudinaryMediaCacheName = 'cloudinary-media-cache';
const versionedCachePrefixes = ['navigation-', 'static-assets-', 'font-styles-', 'font-files-'];
const oneYearSeconds = 365 * 24 * 60 * 60;

registerRoute(
  ({ url }) => (
    url.pathname === '/version.json'
    || url.pathname.startsWith('/__/auth')
  ),
  networkOnly,
);

registerRoute(
  ({ request, url, sameOrigin }) =>
    sameOrigin
    && request.method === 'GET'
    && (
      url.pathname === '/manifest.webmanifest'
      || /\.(?:png|ico)$/u.test(url.pathname)
      || url.pathname.startsWith('/assets/')
    ),
  new CacheFirst({
    cacheName: staticAssetCacheName,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxAgeSeconds: oneYearSeconds,
        maxEntries: 200,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

registerRoute(
  ({ request, url }) =>
    request.method === 'GET'
    && (
      url.origin === 'https://fonts.googleapis.com'
      || (url.origin === 'https://cdn.jsdelivr.net' && url.pathname.includes('/harmonyos-sans-webfont'))
    ),
  new StaleWhileRevalidate({
    cacheName: fontStyleCacheName,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxAgeSeconds: 30 * 24 * 60 * 60,
        maxEntries: 30,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

registerRoute(
  ({ request, url }) =>
    request.method === 'GET'
    && (
      url.origin === 'https://fonts.gstatic.com'
      || (url.origin === 'https://cdn.jsdelivr.net' && /\.(?:woff2?|ttf|otf)$/u.test(url.pathname))
    ),
  new CacheFirst({
    cacheName: fontFileCacheName,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxAgeSeconds: oneYearSeconds,
        maxEntries: 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

registerRoute(
  ({ request, url }) =>
    request.method === 'GET'
    && request.destination === 'image'
    && /^https:\/\/res\.cloudinary\.com$/u.test(url.origin),
  new CacheFirst({
    cacheName: cloudinaryMediaCacheName,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxAgeSeconds: oneYearSeconds,
        maxEntries: 1000,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

registerRoute(new NavigationRoute(
  new NetworkFirst({
    cacheName: navigationCacheName,
    networkTimeoutSeconds: 5,
  }),
  {
    denylist: [/^\/version\.json$/u, /^\/__/u],
  },
));

setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') {
    return await matchPrecache('/index.html') ?? Response.error();
  }
  return Response.error();
});

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((cacheName) =>
          versionedCachePrefixes.some((prefix) => cacheName.startsWith(prefix))
          && ![
            navigationCacheName,
            staticAssetCacheName,
            fontStyleCacheName,
            fontFileCacheName,
          ].includes(cacheName)
        )
        .map((cacheName) => caches.delete(cacheName)),
    )),
  ]));
});
