import { expect, type Browser, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const E2E_USERS = {
  admin: 'admin@integration.invalid',
  announcementManager: 'announcement-manager@integration.invalid',
  facilityManager: 'facility-manager@integration.invalid',
  issueManager: 'issue-manager@integration.invalid',
  ordinary: 'ordinary@integration.invalid',
  other: 'other@integration.invalid',
} as const;

const authEmulatorUrl = process.env.NOVAE_AUTH_EMULATOR_URL ?? 'http://127.0.0.1:9099';
const appOrigin = process.env.NOVAE_E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const apiKey = 'integration-web-api-key';

function fakeGoogleIdToken(email: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    email,
    email_verified: true,
    name: email.split('@')[0],
    sub: `novae-e2e-${email.split('@')[0]}`,
  })}.`;
}

export async function ensureGoogleAccount(email: string) {
  const response = await fetch(
    `${authEmulatorUrl}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${apiKey}`,
    {
      body: JSON.stringify({
        postBody: new URLSearchParams({
          id_token: fakeGoogleIdToken(email),
          providerId: 'google.com',
        }).toString(),
        requestUri: appOrigin,
        returnIdpCredential: true,
        returnSecureToken: true,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  const body = await response.json() as { idToken?: string };
  expect(response.ok, JSON.stringify(body)).toBe(true);
  if (body.idToken) {
    const update = await fetch(
      `${authEmulatorUrl}/identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
      {
        body: JSON.stringify({
          displayName: email.split('@')[0],
          idToken: body.idToken,
          returnSecureToken: true,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    );
    expect(update.ok, await update.text()).toBe(true);
  }
}

export async function signInWithEmulator(page: Page, email: string) {
  await ensureGoogleAccount(email);
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(window.__NOVAE_E2E__), undefined, {
    timeout: 20_000,
  });
  await page.waitForFunction(
    () => {
      const probe = document.createElement('div');
      probe.className = 'fixed';
      document.body.append(probe);
      const loaded = getComputedStyle(probe).position === 'fixed';
      probe.remove();
      return loaded;
    },
    undefined,
    { timeout: 20_000 },
  );
  const profileSynced = page.waitForResponse((response) =>
    response.url().endsWith('/v1/auth/sync') && response.status() === 200,
  );
  await Promise.all([
    profileSynced,
    page.evaluate(async (accountEmail) => {
      await window.__NOVAE_E2E__?.signIn(accountEmail);
    }, email),
  ]);
  // The login page redirects after bootstrap. Starting a second navigation as
  // soon as profile sync responds races that redirect, notably in WebKit.
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 30_000 });
  await page.waitForFunction(
    () => Boolean(document.querySelector('.app-mobile-nav') || document.querySelector('main h1')),
    undefined,
    { timeout: 20_000 },
  );
  const localeGate = page.getByRole('heading', { name: /Choose interface language|選擇介面語言/u });
  if (await localeGate.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /Continue|繼續/u }).click();
  }
  await page.waitForURL((url) => !['/', '/login', '/issues'].includes(url.pathname), { timeout: 30_000 });
}

export async function saveSignedInState(
  browser: Browser,
  email: string,
  path: string,
) {
  await mkdir(dirname(path), { recursive: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInWithEmulator(page, email);
  await expect(page).not.toHaveURL(/\/setup$/u, { timeout: 20_000 });
  await page.waitForFunction(
    () => {
      const dock = document.querySelector('.app-mobile-nav');
      return dock instanceof HTMLElement && getComputedStyle(dock).position === 'fixed';
    },
    undefined,
    { timeout: 20_000 },
  );
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).first()).toBeVisible();
  await context.storageState({ indexedDB: true, path });
  await context.close();
}
