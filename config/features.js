// ─────────────────────────────────────────────────────────────
// Feature flags
//
// Everything new for multi-passenger rides is gated behind this flag.
// Set EXPO_PUBLIC_ENABLE_MULTI_PASSENGER_RIDE=true to enable it.
// With the flag off, the app follows the exact same code paths it did
// before the feature was added.
// ─────────────────────────────────────────────────────────────

const readBooleanFlag = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

export const ENABLE_MULTI_PASSENGER_RIDE = readBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_MULTI_PASSENGER_RIDE,
  false
);
