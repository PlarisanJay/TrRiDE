// Renders components/ScreenFrame with react-dom/server to verify its layout
// contract at real viewport widths, on both platforms.
//
// ScreenFrame is transpiled with Babel into a scratch CJS folder alongside a
// transpiled copy of theme.js, because Node cannot require react-native (its
// index.js is Flow-typed ESM) nor the project's ESM theme module directly.
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const Module = require('module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = __dirname;
const SCRATCH = path.join(ROOT, '.screentest');

// ── react-native stub ───────────────────────────────────────────────────────
const state = { os: 'web', width: 1400 };

// Keys React Native understands that the DOM does not. Stripped so the
// markup under test is only the layout properties that actually matter here.
const RN_ONLY = /^(shadow|elevation)/;

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
  View: 'div',
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'react-native') return rnStub;
  return origLoad.apply(this, arguments);
};

// ── transpile the two ESM modules into a scratch dir ───────────────────────
function toCjs(srcPath, outName, rewrite) {
  const out = babel.transformFileSync(srcPath, {
    babelrc: false,
    configFile: false,
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      ['@babel/plugin-transform-modules-commonjs', { strictMode: false }],
    ],
  });
  let code = out.code;
  if (rewrite) code = rewrite(code);
  const dest = path.join(SCRATCH, outName);
  fs.writeFileSync(dest, code);
  return dest;
}

fs.rmSync(SCRATCH, { recursive: true, force: true });
fs.mkdirSync(SCRATCH, { recursive: true });

toCjs(path.join(ROOT, 'theme.js'), 'theme.cjs');
const sfPath = toCjs(path.join(ROOT, 'components', 'ScreenFrame.js'), 'ScreenFrame.cjs', (c) =>
  c.replace(/require\("\.\.\/theme"\)/g, 'require("./theme.cjs")')
);

const ScreenFrame = require(sfPath).default;

// ── assertions ──────────────────────────────────────────────────────────────
let failures = 0;
const check = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { failures++; console.log('  FAIL  ' + name + (extra !== undefined ? '\n         got: ' + extra : '')); }
};

const render = (os, width) => {
  state.os = os;
  state.width = width;
  return renderToStaticMarkup(
    React.createElement(ScreenFrame, null, React.createElement('span', null, 'app'))
  );
};

const CHILD = '<span>app</span>';
const isBare = (html) => html === CHILD;
const isFramed = (html) => html !== CHILD && /max-width:\s*480px/.test(html);

console.log('\n=== ScreenFrame layout contract ===');

// 1. Native must insert no wrapper at all.
for (const w of [320, 414, 768, 1400, 2560]) {
  check(`native @${w}px renders children with no wrapper`, isBare(render('android', w)), render('android', w));
}

// 2. Narrow browser windows must be identical to native.
for (const w of [320, 375, 414, 480, 519]) {
  check(`web @${w}px renders children with no wrapper`, isBare(render('web', w)), render('web', w));
}

// 3. Wide browser windows get the centred 480px column.
for (const w of [521, 768, 1024, 1400, 2560]) {
  check(`web @${w}px renders the 480px frame`, isFramed(render('web', w)), render('web', w));
}

// 4. Exact breakpoint boundaries — off-by-one here would be invisible.
check('web @520px is UNframed (width <= breakpoint)', isBare(render('web', 520)), render('web', 520));
check('web @521px IS framed (width > breakpoint)', isFramed(render('web', 521)), render('web', 521));

// 5. The frame must actually be centred, not left-aligned.
const wide = render('web', 1400);
check('outer stage centres its child (align-items:center)', /align-items:\s*center/.test(wide), wide);
check('outer stage paints the soft page background', /background-color:\s*#f1f5f9/.test(wide), wide);
check('frame stays full-height so flex screens work', /flex:\s*1/.test(wide), wide);
check('child is present inside the frame', wide.includes(CHILD), wide);

// 6. Authenticated / map variants on wide web.
{
  const renderVariant = (variant, width = 1400) => {
    state.os = 'web';
    state.width = width;
    return renderToStaticMarkup(
      React.createElement(ScreenFrame, { variant }, React.createElement('span', null, 'app'))
    );
  };
  const appHtml = renderVariant('app');
  const mapHtml = renderVariant('map');
  check('app variant is not the 480px phone column', !/max-width:\s*480px/.test(appHtml), appHtml);
  check('app variant still contains the screen', appHtml.includes(CHILD), appHtml);
  check('map variant is full-bleed (no 480px cap)', !/max-width:\s*480px/.test(mapHtml), mapHtml);
  check('map variant still contains the screen', mapHtml.includes(CHILD), mapHtml);
  check('narrow web still skips wrapping even with app variant', isBare((() => {
    state.os = 'web';
    state.width = 414;
    return renderToStaticMarkup(
      React.createElement(ScreenFrame, { variant: 'app' }, React.createElement('span', null, 'app'))
    );
  })()));
}

fs.rmSync(SCRATCH, { recursive: true, force: true });
console.log(failures === 0 ? 'ALL PASS\n' : '\n' + failures + ' FAILURE(S)\n');
process.exit(failures ? 1 : 0);
