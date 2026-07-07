export type InAppBrowserName =
  | 'LINE'
  | 'Facebook'
  | 'Messenger'
  | 'Instagram'
  | 'Threads'
  | 'TikTok'
  | 'WeChat';

const browserPatterns: Array<[InAppBrowserName, RegExp]> = [
  ['LINE', /\bLine\//i],
  ['Messenger', /\bFBAN\/MessengerForiOS|\bFB_IAB\/Messenger|\bMessengerLiteForiOS/i],
  ['Facebook', /\bFBAN\/|\bFBAV\/|\bFB_IAB\/FB4A/i],
  ['Instagram', /\bInstagram\b/i],
  ['Threads', /\bBarcelona\b|\bThreads\b/i],
  ['TikTok', /\bBytedanceWebview\b|\bTikTok\b|\bmusical_ly\b/i],
  ['WeChat', /\bMicroMessenger\b/i],
];

export function detectInAppBrowser(userAgent: string): InAppBrowserName | null {
  return browserPatterns.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? null;
}

export function tryRedirectToExternalBrowser(userAgent: string): boolean {
  if (typeof window === 'undefined') return false;

  const browser = detectInAppBrowser(userAgent);
  if (!browser) return false;

  const currentUrl = new URL(window.location.href);

  // 1. LINE 的專屬參數重導向 (iOS & Android 皆適用)
  if (browser === 'LINE') {
    if (!currentUrl.searchParams.has('openExternalBrowser')) {
      currentUrl.searchParams.set('openExternalBrowser', '1');
      window.location.replace(currentUrl.toString());
      return true;
    }
    return false;
  }

  // 2. Android 平台下的漸進式 Intent 重導向
  const isAndroid = /Android/i.test(userAgent);
  if (isAndroid) {
    const redirectState = currentUrl.searchParams.get('intent_redirected');
    
    // 如果已經嘗試過隱式 Intent 且仍然失敗，說明無法自動跳轉，留在原網頁顯示引導
    if (redirectState === 'final_fallback') {
      return false;
    }

    const host = currentUrl.host;
    const pathname = currentUrl.pathname;
    const search = currentUrl.search;
    const hash = currentUrl.hash;
    const scheme = currentUrl.protocol.replace(':', '');

    if (redirectState !== 'chrome_fallback') {
      // 第一階段：優先嘗試喚起 Chrome
      const fallbackUrl = new URL(window.location.href);
      fallbackUrl.searchParams.set('intent_redirected', 'chrome_fallback');

      const intentUrl = `intent://${host}${pathname}${search}${hash}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(fallbackUrl.toString())};end`;

      window.location.href = intentUrl;
      return true;
    } else {
      // 第二階段：Chrome 喚起失敗，嘗試喚起系統預設瀏覽器（不指定 package，改用隱式 Intent）
      const fallbackUrl = new URL(window.location.href);
      fallbackUrl.searchParams.set('intent_redirected', 'final_fallback');

      const intentUrl = `intent://${host}${pathname}${search}${hash}#Intent;scheme=${scheme};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(fallbackUrl.toString())};end`;

      window.location.href = intentUrl;
      return true;
    }
  }

  // iOS 的其他內建瀏覽器（FB, IG, WeChat...）無法自動跳轉，需依賴引導 UI
  return false;
}

