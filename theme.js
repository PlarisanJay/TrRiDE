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

// Diffusion shadow for elevation as described in DESIGN.md
export const SHADOWS = {
  diffusion: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
};
