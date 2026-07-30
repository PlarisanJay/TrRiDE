import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY_HERE';

const ExpoFileSystemStorage = {
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

const WebStorage = {
  getItem: async (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  removeItem: async (key) => {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

const storage = Platform.OS === 'web' ? WebStorage : ExpoFileSystemStorage;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
