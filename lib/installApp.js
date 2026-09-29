import { Linking, Platform } from 'react-native';

/**
 * Everything the "Install app" CTA needs to know, in one place.
 *
 * WHY A CONFIG VALUE AND NOT A HARDCODED LINK
 * -------------------------------------------
 * The APK is distributed from a GitHub Release using the `latest` alias:
 *
 *   https://github.com/BSITjay/TriRide/releases/latest/download/TriRide.apk
 *
 * That URL is intentionally permanent. Publishing v1.0.1 later changes what it
 * serves, so the button never has to be updated and every install link already
 * handed out keeps working. Hardcoding the build-specific EAS URL instead
 * would freeze every install at whatever shipped the day the button was
 * written — and `expo.dev/accounts/.../builds/...` cannot be used at all,
 * because it is a login-gated dashboard page rather than a file.
 *
 * The rule below is NOT re-applied: `EXPO_PUBLIC_*` is inlined into the web
 * bundle at build time by Expo's Babel plugin, so this value is public by
 * construction. That is fine — the APK is public too. Keep the value pointed
 * at a public release URL and never put a token or secret in it.
 */

export const APK_URL = (process.env.EXPO_PUBLIC_APK_URL || '').trim();

/** Optional EAS build page, used only as a secondary "View build details" link. */
export const BUILD_DETAILS_URL = (process.env.EXPO_PUBLIC_BUILD_URL || '').trim();

export const DISMISS_KEY = 'triride.installBannerDismissed.v1';

/**
 * Distinguishes an iOS browser from a desktop one.
 *
 * Needed because an APK is meaningless on iOS — iOS has no sideload path and
 * no "install unknown apps" toggle. Showing a download button there produces a
 * broken feature, which is worse than showing nothing. iOS web install becomes
 * possible once the PWA manifest lands (Phase 2), via Add to Home Screen.
 *
 * The iPad check matters: iPadOS 13+ identifies itself as "Macintosh" in the
 * user agent, and is only distinguishable by its touch-point count.
 */
export const detectBrowserPlatform = () => {
  if (Platform.OS !== 'web') return Platform.OS;
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) {
    return 'ios';
  }
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
};

/**
 * Resolves what the install CTA should do.
 *
 * Returns one of:
 *   'native'       — running the app itself; never offer to install it
 *   'ios'          — iOS browser; no APK exists, so offer nothing
 *   'unconfigured' — web, but EXPO_PUBLIC_APK_URL is empty. The UI renders a
 *                    disabled button with an explanatory caption rather than
 *                    hiding itself, so a missing env var is obvious during
 *                    development instead of silently absent
 *   'apk'          — ready; `url` is safe to hand to a browser
 *
 * Arguments are injectable so this is testable without a browser or an env.
 */
export const resolveInstallTarget = ({
  os = Platform.OS,
  apkUrl = APK_URL,
  buildUrl = BUILD_DETAILS_URL,
  browserPlatform,
} = {}) => {
  if (os !== 'web') return { kind: 'native', canInstall: false };
  if ((browserPlatform || detectBrowserPlatform()) === 'ios') {
    return { kind: 'ios', canInstall: false };
  }
  // Trimmed here as well as at the env read, because this argument is
  // injectable. A blank line in .env, or a stray space from a copy-paste,
  // would otherwise produce a button that downloads an empty path.
  const url = (apkUrl || '').trim();
  if (!url) return { kind: 'unconfigured', canInstall: false, buildUrl };
  return { kind: 'apk', canInstall: true, url, buildUrl };
};

/**
 * localStorage behind a try/catch.
 *
 * Accessing localStorage throws outright in some privacy modes, and setItem
 * throws when the quota is full. A failed read or write must not break the
 * banner, so both are swallowed and the caller falls back to in-memory state.
 */
const storage = () => {
  if (Platform.OS !== 'web') return null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch (e) {
    return null;
  }
  return null;
};

export const isBannerDismissed = () => {
  const s = storage();
  if (!s) return false;
  try {
    return s.getItem(DISMISS_KEY) === '1';
  } catch (e) {
    return false;
  }
};

export const dismissBanner = () => {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(DISMISS_KEY, '1');
  } catch (e) {
    /* dismissal is remembered in component state even if this fails */
  }
};

/** Lets the user bring the banner back after dismissing it. */
export const resetBannerDismissal = () => {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(DISMISS_KEY);
  } catch (e) {
    /* no-op */
  }
};

/**
 * Hands the APK to the browser.
 *
 * Uses Linking rather than a DOM <a download>. React Native has no link
 * element, and a real GitHub release asset is served with
 * `Content-Disposition: attachment`, so the browser downloads it either way.
 * Linking also means this stays a valid call if the file is ever hosted
 * somewhere that does not set that header.
 */
export const startInstall = (url) => {
  if (Platform.OS !== 'web' || !url) return false;
  try {
    Linking.openURL(url).catch(() => {});
  } catch (e) {
    return false;
  }
  return true;
};
