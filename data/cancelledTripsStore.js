import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

const FILE_KEY = 'cancelled_trips';

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

// Store cancelled/declined rides locally so the driver can review them
// later even when the trip has no driver_id assigned (e.g. declined).
export const saveCancelledTrip = async (trip) => {
  if (!trip || !trip.id) return;
  const current = (await store.getItem()) || [];
  if (current.some((t) => t.id === trip.id)) return;
  const next = [trip, ...current].slice(0, 50);
  await store.setItem(next);
};

export const getCancelledTrips = async () => (await store.getItem()) || [];

export const removeCancelledTrip = async (tripId) => {
  const current = (await store.getItem()) || [];
  await store.setItem(current.filter((t) => t.id !== tripId));
};

export const clearCancelledTrips = async () => store.removeItem();