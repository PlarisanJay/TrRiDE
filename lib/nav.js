/**
 * Single source of truth for primary navigation.
 *
 * WHY THIS EXISTS
 * ---------------
 * The tab lists used to live inside `components/BottomNavBar.js:15-26`, which
 * meant the desktop rail had nowhere to read them from. Copying the arrays
 * into a second component would have worked right up until someone added a
 * tab to one file and not the other.
 *
 * Both BottomNavBar (phone) and AppSidebar (wide web) now import from here, so
 * a tab can only be added in one place.
 *
 * THE NAV-VISIBLE SCREEN LIST IS DELIBERATELY NOT THE TAB LIST
 * -----------------------------------------------------------
 * `Settings` is in NAV_SCREENS but is in neither STUDENT_TABS nor
 * DRIVER_TABS. That is intentional and is existing behaviour: Settings shows
 * the tab bar so the user has a way out of it, but no tab renders as active
 * because the user did not navigate there from a tab. `Profile` is the mirror
 * case — it IS a tab, but it is not in NAV_SCREENS, because the Profile screen
 * renders only its own back button. Both quirks are preserved here rather
 * than "tidied", since changing either one changes phone behaviour.
 */

export const STUDENT_TABS = [
  { key: 'StudentDashboard', icon: 'home', label: 'Home' },
  { key: 'MyOrders', icon: 'receipt-long', label: 'Orders' },
  { key: 'Messages', icon: 'chat', label: 'Messages' },
  { key: 'Profile', icon: 'person', label: 'Profile' },
];

export const DRIVER_TABS = [
  { key: 'DriverDashboard', icon: 'home', label: 'Home' },
  { key: 'Messages', icon: 'chat', label: 'Messages' },
  { key: 'Profile', icon: 'person', label: 'Profile' },
];

/** Screens that carry the persistent tab bar / desktop rail. */
export const NAV_SCREENS = [
  'StudentDashboard',
  'DriverDashboard',
  'MyOrders',
  'Messages',
  'Settings',
];

export const tabsForRole = (role) => (role === 'driver' ? DRIVER_TABS : STUDENT_TABS);

/**
 * Whether the current screen shows persistent navigation.
 *
 * The Messages exception matters: once you open a conversation, MessagesScreen
 * becomes a full-height chat view and the tab bar is hidden. Hiding the
 * desktop rail at the same moment is what keeps the two platforms consistent.
 */
export const isNavScreen = (screenKey, isInChat) =>
  NAV_SCREENS.includes(screenKey) && !(screenKey === 'Messages' && isInChat);

/**
 * Viewport at which the desktop rail replaces the phone tab bar.
 *
 * Matches AdminDashboardScreen.js:41, which switches to its own rail at the
 * same width. Two different breakpoints would mean a window where the admin
 * layout is wide but the user layout is not, which looks like a bug.
 */
export const RAIL_BREAKPOINT = 768;

/**
 * Whether the 260px rail is the one visible piece of persistent navigation.
 *
 * This single predicate exists because two different components need the same
 * answer: App.js uses it to SUPPRESS the phone BottomNavBar, and AppShell uses
 * it to render the rail. Computing it twice with two slightly different
 * expressions is how you end up with both on screen at once, or neither.
 *
 * `os` is required rather than read from Platform so this stays a pure
 * function. Native is always false regardless of width, which is what keeps
 * a large tablet from growing a rail it never had.
 */
export const isRailVisible = (screenKey, isInChat, width, os) =>
  os === 'web' && width >= RAIL_BREAKPOINT && isNavScreen(screenKey, isInChat);

/** Human-readable role for the rail header. */
export const roleLabel = (role) => {
  if (role === 'driver') return 'Driver';
  if (role === 'admin') return 'Admin';
  if (role === 'student') return 'Student';
  return 'TriRide';
};

/**
 * Display name for the rail footer, with the same fallbacks ProfileScreen uses
 * so the two surfaces never disagree about who is signed in.
 */
export const displayName = (profile) => {
  if (!profile) return 'Signed in';
  if (profile.full_name) return profile.full_name;
  if (profile.role === 'driver') return 'Driver User';
  if (profile.role === 'student') return 'Student User';
  return 'TriRide user';
};
