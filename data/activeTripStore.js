import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

const FILE_KEY = 'active_trip';

const NativeStore = {
  getItem: async () => {
    try {
      const file = new File(Paths.document, `${FILE_KEY}.json`);
      if (!file.exists) return null;
      const json = await file.text();
      return JSON.parse(json);
    } catch {
      return null;
    }
  },
  setItem: async (value) => {
    try {
      const file = new File(Paths.document, `${FILE_KEY}.json`);
      await file.write(JSON.stringify(value));
    } catch {}
  },
  removeItem: async () => {
    try {
      const file = new File(Paths.document, `${FILE_KEY}.json`);
      if (file.exists) await file.delete();
    } catch {}
  },
};

const WebStore = {
  getItem: async () => {
    try {
      const raw = localStorage.getItem(FILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setItem: async (value) => {
    try {
      localStorage.setItem(FILE_KEY, JSON.stringify(value));
    } catch {}
  },
  removeItem: async () => {
    try {
      localStorage.removeItem(FILE_KEY);
    } catch {}
  },
};

const store = Platform.OS === 'web' ? WebStore : NativeStore;

// Save the accepted/ongoing trip so the driver can review or
// resume it after accidentally leaving the screen or closing the app.
//
// NOTE: the backing key is a single device-wide slot. getActiveTrip() takes
// the signed-in driver id and refuses to hand back a record belonging to
// anyone else, so a second driver using the same device cannot inherit the
// previous driver's active trip (name, pickup/destination, student_id).
export const saveActiveTrip = async (trip) => {
  if (!trip || !trip.id) return;
  await store.setItem(trip);
};

export const getActiveTrip = async (driverId) => {
  const stored = await store.getItem();
  if (!stored) return null;

  // Refuse to trust a record with no verified owner. This also covers records
  // written by older builds that never stamped driver_id.
  if (!driverId || !stored.driver_id || stored.driver_id !== driverId) {
    await store.removeItem().catch(() => {});
    return null;
  }
  return stored;
};

// Clearing is always safe, so it stays unconditional.
export const clearActiveTrip = async () => store.removeItem();