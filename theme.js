import { StyleSheet } from 'react-native';

export const COLORS = {
  surface: '#faf8ff',
  surfaceDim: '#d9d9e5',
  surfaceBright: '#faf8ff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f3f3fe',
  surfaceContainer: '#ededf9',
  surfaceContainerHigh: '#e7e7f3',
  surfaceContainerHighest: '#e1e2ed',
  onSurface: '#191b23',
  onSurfaceVariant: '#434655',
  inverseSurface: '#2e3039',
  inverseOnSurface: '#f0f0fb',
  outline: '#737686',
  outlineVariant: '#c3c6d7',
  surfaceTint: '#0053db',
  primary: '#004ac6',
  onPrimary: '#ffffff',
  primaryContainer: '#2563eb',
  onPrimaryContainer: '#eeefff',
  inversePrimary: '#b4c5ff',
  secondary: '#006c49',
  onSecondary: '#ffffff',
  secondaryContainer: '#6cf8bb',
  onSecondaryContainer: '#00714d',
  tertiary: '#784b00',
  onTertiary: '#ffffff',
  tertiaryContainer: '#996100',
  onTertiaryContainer: '#ffeedd',
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  background: '#faf8ff',
  onBackground: '#191b23',
  surfaceVariant: '#e1e2ed',
  primaryFixed: '#2563eb',
  primaryFixedDim: '#1d4ed8',
  tertiaryFixed: '#996100',
  secondaryFixedDim: '#5bdba3',
  onPrimaryFixedVariant: '#ffffff',
};

export const SPACING = {
  base: 8,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  marginMobile: 16,
  marginDesktop: 24,
  gutter: 16,
};

export const ROUNDED = {
  sm: 4,
  default: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const TYPOGRAPHY = {
  headlineLg: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
    letterSpacing: -0.64,
  },
  headlineMd: {
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 32,
    letterSpacing: -0.24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  button: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
  },
  headlineLgMobile: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 36,
  },
};

// ─────────────────────────────────────────────────────────────
// Refined depth system.
//
// The app had drifted into a Tailwind slate/blue palette through
// 420 raw hex values, and into a flat-primary look. These token
// sets formalise what was actually being used so screens can
// reference the theme instead of hardcoding.
// ─────────────────────────────────────────────────────────────

// Text / icon ink, lightest to heaviest.
export const INK = {
  strong: '#0f172a',
  body: '#1e293b',
  deep: '#334155',
  slate: '#475569',
  muted: '#64748b',
  subtle: '#94a3b8',
  faint: '#cbd5e1',
};

// Surface tiers: raised cards sit above sunken wells sit above the page.
export const CANVAS = {
  base: '#f8fafc',
  raised: '#ffffff',
  sunken: '#f1f5f9',
  line: '#e2e8f0',
};

// Status / semantic accents. Each has a wash (very light background),
// a soft (border / chip), and a solid (icon / text) variant.
export const ACCENT = {
  blue: '#2563eb',
  blueDeep: '#1d4ed8',
  // Mid blue used for selection rings and emphasis borders.
  blueMid: '#bfdbfe',
  blueSoft: '#dbeafe',
  blueWash: '#eff6ff',

  indigo: '#818cf8',
  sky: '#0284c7',
  skySoft: '#e0f2fe',

  green: '#16a34a',
  greenBright: '#22c55e',
  greenMid: '#86efac',
  greenSoft: '#bbf7d0',
  greenWash: '#f0fdf4',
  // Text ink for use ON greenSoft / greenWash fills. The solid green is far
  // too light to read as text on a tinted surface.
  greenInk: '#14532d',
  greenInkMuted: '#166534',

  amber: '#f59e0b',
  // Text ink for use ON amberSoft / amberWash fills. The solid amber is far
  // too light to read as text on a tinted surface, same as the green pair.
  amberInk: '#7c2d12',
  amberInkMuted: '#9a3412',
  orange: '#f97316',
  orangeDeep: '#ea580c',
  orangeSoft: '#ffedd5',
  orangeWash: '#fff7ed',

  red: '#ef4444',
};

// Elevation scale. Deliberately low-opacity with a generous radius so
// cards read as lifted rather than outlined, and Android `elevation`
// is kept <= 3 because anything higher renders as a hard drop shadow.
//
// ELEVATION replaces the flat SHADOWS tokens below; new code should
// prefer it. SHADOWS is retained for the screens outside this pass.
export const ELEVATION = {
  none: {},
  xs: {
    shadowColor: INK.strong,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 0,
  },
  sm: {
    shadowColor: INK.strong,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 6,
    elevation: 1,
  },
  md: {
    shadowColor: INK.strong,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.045,
    shadowRadius: 12,
    elevation: 2,
  },
  lg: {
    shadowColor: INK.strong,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.055,
    shadowRadius: 20,
    elevation: 3,
  },
  // Tinted lift, reserved for a single primary CTA. Do not spread.
  glow: {
    shadowColor: ACCENT.blueDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 3,
  },
};

// Hairline strokes. StyleSheet.hairlineWidth is ~0.5pt on modern
// devices, so a "1px" border no longer reads as a hard line.
export const BORDERS = {
  none: {},
  soft: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.05)',
  },
  hair: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.07)',
  },
  strong: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.12)',
  },
  accent: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(37, 99, 235, 0.28)',
  },
};

// Gradient ramps for expo-linear-gradient.
// `brand` / `brandBright` are for small, high-focus surfaces (FAB,
// active indicator). `wash` ramps are for large surfaces where a flat
// fill looked dead. Nothing here is a saturated multi-hue gradient.
export const GRADIENTS = {
  brand: {
    colors: ['#0a3d91', '#2f5fe0'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  brandBright: {
    colors: ['#2563eb', '#4f6ef7'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  horizontal: {
    colors: ['#0a3d91', '#2f5fe0'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },
  // Very light wash for large cards and headers.
  wash: {
    colors: ['#f5f7ff', '#eaeefe'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  washCool: {
    colors: ['#f4f8ff', '#eaf1fe'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  // Hero backdrop for the Profile screen.
  dusk: {
    colors: ['#1b2a5e', '#3a4a9c'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
};

// Subtle shadow tokens — clean, professional, no heavy floating cards
export const SHADOWS = {
  diffusion: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  button: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
};
