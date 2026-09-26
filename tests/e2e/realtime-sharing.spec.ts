import { expect, test, type Page, type WebSocket } from '@playwright/test';
import { E2E_USERS, signInWithEmulator } from './support/accounts';

test('visible tabs share realtime and recover after owner closure and offline mode', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const sockets = new Map<WebSocket, Page>();
  let created = 0;
  const track = (page: Page) => {
    // Chromium can discard the old document's socket instrumentation before
    // emitting its close event during the login helper's full navigation.
    page.on('response', (response) => {
      const request = response.request();
      if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) return;
      for (const [socket, owner] of sockets) if (owner === page) sockets.delete(socket);
    });
    page.on('websocket', (socket) => {
      if (new URL(socket.url()).pathname !== '/v1/realtime') return;
      created += 1;
      sockets.set(socket, page);
      socket.on('close', () => sockets.delete(socket));
    });
  };
  const connected = () => [...sockets].filter(([socket, page]) => !socket.isClosed() && !page.isClosed());

  try {
    const first = await context.newPage(); track(first);
    await signInWithEmulator(first, E2E_USERS.ordinary);
    await expect.poll(() => connected().length).toBe(1);
    const second = await context.newPage(); track(second);
    // Firebase persistence belongs to the shared browser context: a real second
    // tab restores the existing account rather than signing in again.
    await second.goto('/issues');
    await expect(second.getByRole('navigation', { name: /Primary navigation|主要導覽/u }).first()).toBeVisible();
    await expect.poll(() => connected().length).toBe(1);
    // Headless Chromium keeps both pages visible; this exercises actual lock
    // contention rather than merely the hidden-tab suspension policy.
    for (const page of [first, second]) {
      expect(await page.evaluate(() => document.visibilityState)).toBe('visible');
    }
    const initialCount = created;
    // Cover delayed ticket fetches/reconnects, which must not create a second socket.
    await second.waitForTimeout(2_000);
    expect(connected()).toHaveLength(1);
    expect(created).toBe(initialCount);

    const owner = connected()[0][1];
    const follower = owner === first ? second : first;
    await owner.close();
    await expect.poll(() => connected().length).toBe(1);
    expect(connected()[0][1]).toBe(follower);
    expect(created).toBe(initialCount + 1);

    await context.setOffline(true);
    await expect.poll(() => connected().length).toBe(0);
    await context.setOffline(false);
    await expect.poll(() => connected().length).toBe(1);
    expect(connected()[0][1]).toBe(follower);
    expect(created).toBe(initialCount + 2);
    await follower.waitForTimeout(2_000);
    expect(connected()).toHaveLength(1);
    expect(created).toBe(initialCount + 2);
  } finally { await context.close(); }
});
