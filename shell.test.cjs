// Renders the web shell (components/AppShell, components/InstallBanner) and
// exercises the pure navigation / install predicates with react-dom/server.
//
// Same technique as screenframe.test.cjs: the project's ESM modules are
// transpiled with Babel into a scratch CJS folder, because Node cannot require
// react-native (its index.js is Flow-typed ESM) or the ESM theme module.
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const Module = require('module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = __dirname;
const SCRATCH = path.join(ROOT, '.shelltest');

// ── react-native stub ───────────────────────────────────────────────────────
const state = { os: 'web', width: 1400 };

// Keys React Native understands that the DOM does not. Stripped so the markup
// under test contains only the layout properties that matter here.
const RN_ONLY = /^(shadow|elevation)/;

// Real wrapper components rather than raw DOM tags. Passing 'button' straight
// through would push React Native props (accessibilityLabel, activeOpacity,
// numberOfLines) into the DOM as unknown attributes, which both floods the
// output with warnings and makes it impossible to assert on the real
// accessibility contract. These translate RN -> DOM the way react-native-web
// does, so an assertion about aria-label means something.
const rnElement = (Tag) => {
  const C = (props) => {
    const {
      children,
      style,
      onPress,
      accessibilityRole,
      accessibilityLabel,
      accessibilityState,
      // Consumumed by RN, meaningless to the DOM.
      activeOpacity, hitSlop, numberOfLines, contentContainerStyle,
      showsVerticalScrollIndicator, onLayout,
    } = props;
    return React.createElement(
      Tag,
      {
        style,
        onClick: onPress,
        'aria-label': accessibilityLabel,
        'aria-selected': accessibilityState ? accessibilityState.selected : undefined,
      },
      children
    );
  };
  return C;
};

const rnStub = {
  Platform: { get OS() { return state.os; } },
  StyleSheet: {
    create: (obj) =>
      Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [
          k,
          typeof v === 'object' && v !== null && !Array.isArray(v)
            ? Object.fromEntries(Object.entries(v).filter(([p]) => !RN_ONLY.test(p)))
            : v,
        ])
      ),
    hairlineWidth: 0.5,
    absoluteFill: {},
  },
  useWindowDimensions: () => ({ width: state.width, height: 900 }),
  View: rnElement('div'),
  Text: rnElement('span'),
  TouchableOpacity: rnElement('button'),
  ScrollView: rnElement('div'),
  Alert: { alert() {} },
  Linking: { openURL: async () => {} },
};

// Icon + gradient stubs. MaterialIcons emits the glyph name as an attribute so
// assertions can check which icon a tab was given.
const iconStub = (props) =>
  React.createElement('i', { 'data-icon': props.name }, props.name);
const gradientStub = (props) => React.createElement('div', { 'data-gradient': '1' }, props.children);

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'react-native') return rnStub;
  if (request === '@expo/vector-icons') return { MaterialIcons: iconStub };
  if (request === 'expo-linear-gradient') return { LinearGradient: gradientStub };
  return origLoad.apply(this, arguments);
};

// ── transpile the ESM modules into a scratch dir ────────────────────────────
// Every relative import between the modules under test is redirected at the
// transpiled .cjs copy, so the real on-disk module graph is not needed.
const MODULE_MAP = {
  theme: 'theme',
  'lib/nav': 'nav',
  'lib/dialog': 'dialog',
  'lib/installApp': 'installApp',
  ScreenFrame: 'ScreenFrame',
  AppSidebar: 'AppSidebar',
};

function toCjs(srcPath, outName) {
  const out = babel.transformFileSync(srcPath, {
    babelrc: false,
    configFile: false,
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      ['@babel/plugin-transform-modules-commonjs', { strictMode: false }],
    ],
  });
  const code = out.code.replace(/require\("([^"]+)"\)/g, (m, p) => {
    const key = p.replace(/^\.\.\//, '').replace(/^\.\//, '');
    return MODULE_MAP[key] ? `require("./${MODULE_MAP[key]}.cjs")` : m;
  });
  const dest = path.join(SCRATCH, outName);
  fs.writeFileSync(dest, code);
  return dest;
}

fs.rmSync(SCRATCH, { recursive: true, force: true });
fs.mkdirSync(SCRATCH, { recursive: true });

toCjs(path.join(ROOT, 'theme.js'), 'theme.cjs');
toCjs(path.join(ROOT, 'lib', 'nav.js'), 'nav.cjs');
toCjs(path.join(ROOT, 'lib', 'dialog.js'), 'dialog.cjs');
toCjs(path.join(ROOT, 'lib', 'installApp.js'), 'installApp.cjs');
toCjs(path.join(ROOT, 'components', 'ScreenFrame.js'), 'ScreenFrame.cjs');
toCjs(path.join(ROOT, 'components', 'AppSidebar.js'), 'AppSidebar.cjs');
toCjs(path.join(ROOT, 'components', 'AppShell.js'), 'AppShell.cjs');
toCjs(path.join(ROOT, 'components', 'InstallBanner.js'), 'InstallBanner.cjs');

const nav = require(path.join(SCRATCH, 'nav.cjs'));
const installApp = require(path.join(SCRATCH, 'installApp.cjs'));
const AppShell = require(path.join(SCRATCH, 'AppShell.cjs')).default;
const InstallBanner = require(path.join(SCRATCH, 'InstallBanner.cjs')).default;

// ── assertions ──────────────────────────────────────────────────────────────
let failures = 0;
let passes = 0;
const check = (name, cond, extra) => {
  if (cond) { passes++; console.log('  PASS  ' + name); }
  else { failures++; console.log('  FAIL  ' + name + (extra !== undefined ? '\n         got: ' + extra : '')); }
};

// Must be the real createElement, not a one-arg wrapper: AppShell's behaviour
// under test is entirely in its props (railActive) and children.
const h = React.createElement;

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n=== lib/nav.js — the one source of tab + rail truth ===');
// ═══════════════════════════════════════════════════════════════════════════

// 1. Role -> tab list, matching the pre-existing BottomNavBar behaviour
//    exactly, including the fact that a non-driver role (e.g. admin) gets the
//    student list rather than an empty one.
check('student gets the 4 student tabs', nav.tabsForRole('student').length === 4, JSON.stringify(nav.tabsForRole('student').map(t => t.key)));
check('driver gets the 3 driver tabs', nav.tabsForRole('driver').length === 3, JSON.stringify(nav.tabsForRole('driver').map(t => t.key)));
check('driver tabs omit Orders', !nav.tabsForRole('driver').some(t => t.key === 'MyOrders'));
check('unknown role falls back to student tabs', nav.tabsForRole(null).length === 4);
check('every tab has key + icon + label', [...nav.STUDENT_TABS, ...nav.DRIVER_TABS].every(t => t.key && t.icon && t.label));

// 2. The nav-visible screen list, preserved verbatim from App.js:641
for (const s of nav.NAV_SCREENS) {
  check(`"${s}" is a nav screen`, nav.isNavScreen(s, false) === true);
}
for (const s of ['Profile', 'BookRide', 'OrderDetails', 'AdminDashboard', 'Login', 'Splash']) {
  check(`"${s}" is NOT a nav screen`, nav.isNavScreen(s, false) === false);
}

// 3. The Messages/chat exception — the one easily-broken case
check('Messages is a nav screen at the list level', nav.isNavScreen('Messages', false) === true);
check('Messages in an open chat is NOT a nav screen', nav.isNavScreen('Messages', true) === false);
check('inChat does not affect StudentDashboard', nav.isNavScreen('StudentDashboard', true) === true);

// 4. Settings is nav-visible but is deliberately not a tab
check('Settings is nav-visible', nav.isNavScreen('Settings', false) === true);
check('Settings is in neither tab list', !nav.tabsForRole('student').some(t => t.key === 'Settings') && !nav.tabsForRole('driver').some(t => t.key === 'Settings'));
check('Profile is a tab', nav.tabsForRole('student').some(t => t.key === 'Profile'));
check('Profile is not nav-visible', nav.isNavScreen('Profile', false) === false);

// 5. Rail visibility. The os check must win over the width check, or a large
//    tablet grows a rail the phone build never had.
check('rail hidden on native even at 2560px', nav.isRailVisible('StudentDashboard', false, 2560, 'android') === false);
check('rail hidden on iOS even at 2560px', nav.isRailVisible('StudentDashboard', false, 2560, 'ios') === false);
check('rail hidden on web below breakpoint', nav.isRailVisible('StudentDashboard', false, 767, 'web') === false);
check('rail shown on web at breakpoint', nav.isRailVisible('StudentDashboard', false, 768, 'web') === true);
check('rail shown on web well above breakpoint', nav.isRailVisible('StudentDashboard', false, 2560, 'web') === true);
check('rail hidden on wide web for Profile', nav.isRailVisible('Profile', false, 2560, 'web') === false);
check('rail hidden on wide web inside a chat', nav.isRailVisible('Messages', true, 2560, 'web') === false);
check('rail shown on wide web at the list level for Messages', nav.isRailVisible('Messages', false, 2560, 'web') === true);

// 6. Rail visibility must be a strict subset of tab-bar visibility. If these
//    ever diverge, both navigation surfaces render on the same screen.
for (const s of nav.NAV_SCREENS) {
  for (const w of [375, 767, 768, 1440]) {
    for (const os of ['web', 'android', 'ios']) {
      const rail = nav.isRailVisible(s, false, w, os);
      const bar = nav.isNavScreen(s, false);
      if (rail && !bar) { check(`rail implies tab bar @${s}/${w}/${os}`, false); }
    }
  }
}
check('rail is never shown without the tab bar policy allowing it', true);

// 7. Labels
check('roleLabel driver', nav.roleLabel('driver') === 'Driver');
check('roleLabel student', nav.roleLabel('student') === 'Student');
check('displayName prefers full_name', nav.displayName({ full_name: 'Ada L', role: 'student' }) === 'Ada L');
check('displayName falls back for a student', nav.displayName({ role: 'student' }) === 'Student User');
check('displayName falls back for a driver', nav.displayName({ role: 'driver' }) === 'Driver User');
check('displayName handles a null profile', nav.displayName(null) === 'Signed in');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n=== lib/installApp.js — what the CTA is allowed to do ===');
// ═══════════════════════════════════════════════════════════════════════════

const APK = 'https://github.com/BSITjay/TriRide/releases/latest/download/TriRide.apk';

// 1. Never offer to install the app from inside the app.
for (const os of ['android', 'ios']) {
  const t = installApp.resolveInstallTarget({ os, apkUrl: APK });
  check(`${os} never offers an install`, t.kind === 'native' && t.canInstall === false, JSON.stringify(t));
}
// A large Android phone must not flip this: os is checked before width.
check('android with a wide screen still never installs', installApp.resolveInstallTarget({ os: 'android', apkUrl: APK, browserPlatform: 'desktop' }).kind === 'native');

// 2. iOS cannot install an APK, so it is offered nothing at all.
for (const bp of ['ios']) {
  const t = installApp.resolveInstallTarget({ os: 'web', apkUrl: APK, browserPlatform: bp });
  check(`iOS browser gets no install (kind=ios)`, t.kind === 'ios' && t.canInstall === false, JSON.stringify(t));
}

// 3. Android browser + a configured URL is the happy path.
{
  const t = installApp.resolveInstallTarget({ os: 'web', apkUrl: APK, browserPlatform: 'android' });
  check('android browser + URL => apk', t.kind === 'apk' && t.canInstall === true, JSON.stringify(t));
  check('the URL is passed through untouched', t.url === APK);
}

// 4. Desktop browsers, which is the case this feature was actually built for.
{
  const t = installApp.resolveInstallTarget({ os: 'web', apkUrl: APK, browserPlatform: 'desktop' });
  check('desktop browser + URL => apk', t.kind === 'apk' && t.url === APK, JSON.stringify(t));
}

// 5. Unconfigured must be visible, not silent. An empty or whitespace URL is
//    treated as absent.
for (const bad of ['', '   ', undefined, null]) {
  const t = installApp.resolveInstallTarget({ os: 'web', apkUrl: bad, browserPlatform: 'desktop' });
  check(`unconfigured URL ${JSON.stringify(bad)} => unconfigured`, t.kind === 'unconfigured' && t.canInstall === false, JSON.stringify(t));
}
{
  const t = installApp.resolveInstallTarget({ os: 'web', apkUrl: APK, buildUrl: 'https://expo.dev/x', browserPlatform: 'desktop' });
  check('build details URL is carried through', t.buildUrl === 'https://expo.dev/x', JSON.stringify(t));
}

// 6. startInstall must refuse to navigate anywhere without a real URL.
check('startInstall refuses an empty URL', installApp.startInstall('') === false);
check('startInstall refuses null', installApp.startInstall(null) === false);

// ── dismissal storage ───────────────────────────────────────────────────────
console.log('\n=== install banner dismissal persistence ===');
const makeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
};

const withWindow = (win, fn) => {
  const had = 'window' in global;
  const prev = global.window;
  global.window = win;
  try { return fn(); } finally {
    if (had) global.window = prev; else delete global.window;
  }
};

state.os = 'web';
{
  const store = makeStorage();
  withWindow({ localStorage: store }, () => {
    check('starts not dismissed', installApp.isBannerDismissed() === false);
    installApp.dismissBanner();
    check('dismissBanner persists', installApp.isBannerDismissed() === true);
    check('dismissal key is versioned', store._map.has('triride.installBannerDismissed.v1'));
    installApp.resetBannerDismissal();
    check('resetBannerDismissal clears it', installApp.isBannerDismissed() === false);
  });
}

// localStorage throws in some privacy modes; a banner must not take the app
// down because a preference could not be saved.
{
  const throwing = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() { throw new Error('SecurityError'); },
  };
  withWindow({ localStorage: throwing }, () => {
    let threw = false;
    try { check('isBannerDismissed survives a throwing store', installApp.isBannerDismissed() === false); }
    catch (e) { threw = true; }
    try { installApp.dismissBanner(); } catch (e) { threw = true; }
    check('dismissBanner survives a throwing store', !threw);
  });
}

// No window at all (SSR / a bare Node render) must degrade to "not dismissed".
withWindow(undefined, () => {
  check('no window => not dismissed, no throw', installApp.isBannerDismissed() === false);
});
state.os = 'android';
withWindow({ localStorage: makeStorage() }, () => {
  installApp.dismissBanner();
  check('native never writes dismissal state', installApp.isBannerDismissed() === false);
});
state.os = 'web';

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n=== components/AppShell.js — layout contract ===');
// ═══════════════════════════════════════════════════════════════════════════

const renderShell = (os, width, props = {}) => {
  state.os = os;
  state.width = width;
  return renderToStaticMarkup(
    h(AppShell, {
      railActive: false,
      userRole: 'student',
      userProfile: { full_name: 'Ada Lovelace', role: 'student' },
      currentScreen: 'StudentDashboard',
      onNavigate: () => {},
      onBookRide: () => {},
      onLogout: () => {},
      ...props,
    }, h('span', null, 'app'))
  );
};

// 1. Native inserts nothing at all — the single most important assertion in
//    this file. Any View added here is a layout change on the phone.
for (const w of [320, 414, 768, 1400, 2560]) {
  const html = renderShell('android', w, { railActive: true, banner: h('span', null, 'BANNER') });
  check(`native @${w}px renders children bare, with no rail and no banner`, html === '<span>app</span>', html);
}

// 2. Web always frames, because the screens still need the 480px column.
for (const w of [521, 768, 1024, 2560]) {
  check(`web @${w}px with rail off still frames the column`, /max-width:\s*480px/.test(renderShell('web', w)), renderShell('web', w));
}

// 3. Narrow web must NOT get a rail, even when the policy says so — the
//    breakpoint is applied in App.js, and this proves the shell obeys it.
check('web @375px with railActive=false has no rail', !/Book a ride/.test(renderShell('web', 375)));

// 4. Rail present only when requested.
{
  const on = renderShell('web', 1440, { railActive: true });
  const off = renderShell('web', 1440, { railActive: false });
  check('railActive=true renders the rail', /Book a ride/.test(on), on);
  check('railActive=false renders no rail', !/Book a ride/.test(off), off);
  check('the rail is 260px wide', /width:\s*260px/.test(on), on);
  check('the rail is a fixed sibling of the content column', /flex-direction:\s*row/.test(on), on);
}

// 5. Rail contents: role, tabs, active state, user footer.
{
  const html = renderShell('web', 1440, {
    railActive: true,
    userRole: 'student',
    currentScreen: 'MyOrders',
    userProfile: { full_name: 'Ada Lovelace', role: 'student' },
  });
  check('rail shows the wordmark', /TriRide/.test(html));
  check('rail shows the role', />Student</.test(html), html);
  check('rail shows the signed-in name', /Ada Lovelace/.test(html));
  check('rail shows a logout control', /Log Out/.test(html));
  for (const label of ['Home', 'Orders', 'Messages', 'Profile']) {
    check(`rail lists the "${label}" tab`, new RegExp('>' + label + '<').test(html), html);
  }
  check('rail uses the same icons as the tab list', /data-icon="receipt-long"/.test(html));
  check('the current tab is marked selected', /aria-selected="true"/.test(html), html);
  check('students get the Book a ride action', /Book a ride/.test(html));
}

// 6. Driver rail: no booking CTA, and Orders must not appear.
{
  const html = renderShell('web', 1440, {
    railActive: true,
    userRole: 'driver',
    currentScreen: 'DriverDashboard',
    userProfile: { full_name: 'Grace H', role: 'driver' },
  });
  check('driver rail has NO Book a ride action', !/Book a ride/.test(html), html);
  check('driver rail has no Orders tab', !/>Orders</.test(html), html);
  check('driver rail shows Driver role', />Driver</.test(html));
  check('driver rail shows the driver name', /Grace H/.test(html));
  check('driver rail still shows Home', />Home</.test(html));
}

// 7. Unread badge, mirroring BottomNavBar's rule that it hides on Messages.
{
  const away = renderShell('web', 1440, { railActive: true, currentScreen: 'StudentDashboard', unreadMessagesCount: 3 });
  const onIt = renderShell('web', 1440, { railActive: true, currentScreen: 'Messages', unreadMessagesCount: 3 });
  check('rail shows an unread count on Messages', />3</.test(away), away);
  check('rail hides the badge while ON Messages', !/>3</.test(onIt), onIt);
  const many = renderShell('web', 1440, { railActive: true, currentScreen: 'StudentDashboard', unreadMessagesCount: 42 });
  check('unread count caps at 9+', />9\+</.test(many), many);
  const none = renderShell('web', 1440, { railActive: true, currentScreen: 'StudentDashboard', unreadMessagesCount: 0 });
  check('no badge when there is nothing unread', !/9\+/.test(none));
}

// 8. The banner is full-bleed, above the rail row — not inside the frame.
{
  const html = renderShell('web', 1440, { railActive: true, banner: h('span', null, 'BANNER') });
  const bannerAt = html.indexOf('BANNER');
  const railAt = html.search(/Book a ride/);
  const frameAt = html.search(/max-width:\s*480px/);
  check('banner renders', bannerAt !== -1, html);
  check('banner sits above the rail', bannerAt !== -1 && railAt !== -1 && bannerAt < railAt, `banner@${bannerAt} rail@${railAt}`);
  check('banner sits above the framed column', bannerAt !== -1 && frameAt !== -1 && bannerAt < frameAt, `banner@${bannerAt} frame@${frameAt}`);
}

// 9. Children must survive inside the frame.
check('app content is still rendered', /app/.test(renderShell('web', 1440, { railActive: true })));

{
  const html = renderShell('web', 1440, { railActive: true, frameVariant: 'app' });
  check('app frameVariant drops the 480px phone column', !/max-width:\s*480px/.test(html), html);
  check('app frameVariant still renders the rail', /Book a ride/.test(html), html);
  const mapHtml = renderShell('web', 1440, { railActive: false, frameVariant: 'map' });
  check('map frameVariant is full-bleed', !/max-width:\s*480px/.test(mapHtml), mapHtml);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n=== components/InstallBanner.js — the X / TikTok prompt ===');
// ═══════════════════════════════════════════════════════════════════════════

// The banner reads EXPO_PUBLIC_APK_URL at module scope, so a configured render
// is exercised by driving resolveInstallTarget's output through the same
// branches rather than by mutating the environment mid-process.
const renderBanner = (os) => {
  state.os = os;
  return renderToStaticMarkup(h(InstallBanner));
};

// 1. Never on native.
for (const os of ['android', 'ios']) {
  check(`banner renders nothing on ${os}`, renderBanner(os) === '', renderBanner(os));
}

// 2. With no APK URL configured, the real state in this repo right now: the
//    bar must still be visible and say so, rather than silently vanishing.
{
  const html = renderBanner('web');
  const isConfigured = Boolean(process.env.EXPO_PUBLIC_APK_URL);
  if (isConfigured) {
    check('banner with a configured URL offers Install app', /Install app/.test(html), html);
    check('banner with a configured URL offers build details', /View build details/.test(html), html);
  } else {
    check('banner still renders when unconfigured', /Install app/.test(html), html);
    check('banner states the installer is not configured', /Installer not configured/.test(html), html);
    check('the value proposition is still shown', /Get the TriRide app/.test(html), html);
    check('the sign-in caveat is disclosed', /sign in once/i.test(html), html);
  }
}

// 3. Dismissible: a close control must exist and be labelled.
{
  const html = renderBanner('web');
  check('banner has a dismiss control', /data-icon="close"/.test(html), html);
  check('dismiss is labelled for screen readers', /aria-label="Dismiss install prompt"/.test(html), html);
  check('the primary action is labelled', /aria-label="Install app"/.test(html), html);
}

// 4. Dismissed banners stay dismissed on a re-render.
{
  const store = makeStorage();
  withWindow({ localStorage: store }, () => {
    installApp.dismissBanner();
    const html = renderToStaticMarkup(h(InstallBanner));
    check('a dismissed banner renders nothing', html === '', html);
  });
  installApp.resetBannerDismissal();
}

fs.rmSync(SCRATCH, { recursive: true, force: true });
console.log(
  failures === 0
    ? `\nALL PASS (${passes} assertions)\n`
    : `\n${failures} FAILURE(S) of ${passes + failures}\n`
);
process.exit(failures ? 1 : 0);
