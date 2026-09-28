import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Only apply the URL polyfill on native platforms (not web)
// On web, the polyfill overrides native fetch and causes "Failed to fetch" errors
if (Platform.OS !== 'web') {
  try {
    require('react-native-url-polyfill/auto');
  } catch (e) {}
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY_HERE';

// Android SSL fix: retry fetch on SSLHandshakeException / connection reset
// Web and iOS are unaffected and use native browser fetch directly.
const androidFetchWithRetry = async (url, options, retries = 3, delayMs = 300) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      const isSSLError =
        err?.message?.includes('SSLHandshakeException') ||
        err?.message?.includes('Connection reset by peer') ||
        err?.message?.includes('fetch failed');
      if (isSSLError && attempt < retries) {
        await new Promise((res) => setTimeout(res, delayMs * attempt));
      } else {
        throw err;
      }
    }
  }
};

const WebStorage = {
  getItem: (key) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {}
  },
  removeItem: (key) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {}
  },
};

const getStorage = () => {
  if (Platform.OS === 'web') return WebStorage;
  try {
    const { File, Paths } = require('expo-file-system');
    return {
      getItem: async (key) => {
        try {
          const file = new File(Paths.document, `supabase_${key}.json`);
          if (!file.exists) return null;
          const json = await file.text();
          const { value } = JSON.parse(json);
          return value;
        } catch {
          return null;
        }
      },
      setItem: async (key, value) => {
        try {
          const file = new File(Paths.document, `supabase_${key}.json`);
          await file.write(JSON.stringify({ value }));
        } catch {}
      },
      removeItem: async (key) => {
        try {
          const file = new File(Paths.document, `supabase_${key}.json`);
          if (file.exists) await file.delete();
        } catch {}
      },
    };
  } catch {
    return WebStorage;
  }
};

const storage = getStorage();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  ...(Platform.OS === 'android' ? { global: { fetch: androidFetchWithRetry } } : {}),
});
