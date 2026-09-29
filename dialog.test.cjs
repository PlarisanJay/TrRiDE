// Exercises lib/dialog.js under both platforms.
//
// lib/dialog.js is an ES module that imports react-native, which cannot be
// required in plain Node (its index.js is Flow-typed ESM). So the source is
// loaded into a vm sandbox with a stubbed react-native, and the `export`
// keywords are stripped. The logic under test is untouched.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const PLATFORM = process.argv[2] || 'web';
const calls = [];

const stub = {
  Platform: { OS: PLATFORM },
  Alert: {
    // Mirrors react-native-web: a no-op. Also models native's behaviour that
    // a button-less Alert auto-dismisses, i.e. fires no onPress.
    alert: (title, message, buttons) => calls.push({ title, message, buttons }),
  },
};

const file = path.resolve(__dirname, 'lib', 'dialog.js');
let src = fs.readFileSync(file, 'utf8');
src = src.replace(/^\s*import\s+\{[^}]*\}\s+from\s+'react-native';\s*$/m, '');
src = src.replace(/^export const /gm, 'const ');

const EXPORTS = 'alertDialog, confirmDialog, notifyDialog, subscribeDialog, getDialog, dismissDialog';
const sandbox = {
  module: { exports: {} },
  console,
  Promise,
  setTimeout,
  clearTimeout,
  __RN__: stub,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  `const { Alert, Platform } = __RN__;\n${src}\nmodule.exports = { ${EXPORTS} };`,
  sandbox,
  { filename: file }
);
const dialog = sandbox.module.exports;

let failures = 0;
const check = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { failures++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
};
const tick = () => new Promise((r) => setTimeout(r, 0));

(async () => {
  console.log('\n=== Platform.OS = ' + PLATFORM + ' ===');

  if (PLATFORM !== 'web') {
    let settled = false;
    dialog.alertDialog({ title: 'T', message: 'M' }).then(() => { settled = true; });
    await tick();
    check('alertDialog resolves with NO button press (cannot deadlock)', settled);
    check('alertDialog called Alert.alert with no buttons array',
      calls.length === 1 && calls[0].buttons === undefined, JSON.stringify(calls[0]));

    calls.length = 0;
    let yes = null, no = null;
    dialog.confirmDialog({ title: 'Del', message: 'sure?', confirmText: 'Delete', cancelText: 'Cancel', destructive: true })
      .then((v) => { yes = v; });
    const btns = calls[0].buttons;
    check('confirmDialog rendered 2 buttons', !!btns && btns.length === 2);
    check('cancel first, style=cancel', btns[0].text === 'Cancel' && btns[0].style === 'cancel');
    check('confirm second, style=destructive', btns[1].text === 'Delete' && btns[1].style === 'destructive');
    check('promise still pending before any press', yes === null);
    btns[1].onPress();
    await tick();
    check('confirmDialog resolves true on confirm press', yes === true, 'got ' + yes);

    calls.length = 0;
    dialog.confirmDialog({ title: 'Del', message: 'sure?' }).then((v) => { no = v; });
    calls[0].buttons[0].onPress();
    await tick();
    check('confirmDialog resolves false on cancel press', no === false, 'got ' + no);

    calls.length = 0;
    let acked = false;
    dialog.notifyDialog({ title: 'Cancelled', message: 'gone' }).then(() => { acked = true; });
    const nb = calls[0].buttons;
    check('notifyDialog renders exactly 1 button labelled OK', !!nb && nb.length === 1 && nb[0].text === 'OK');
    check('notifyDialog pending until acknowledged', acked === false);
    nb[0].onPress();
    await tick();
    check('notifyDialog resolves after OK press', acked === true);
  } else {
    check('no dialog visible initially', dialog.getDialog() === null);

    const order = [];
    const p1 = dialog.confirmDialog({ title: 'First', message: '1' }).then((v) => order.push('A=' + v));
    const p2 = dialog.confirmDialog({ title: 'Second', message: '2' }).then((v) => order.push('B=' + v));
    const p3 = dialog.alertDialog({ title: 'Third', message: '3' }).then((v) => order.push('C=' + v));

    const d1 = dialog.getDialog();
    check('only the first dialog is visible', !!d1 && d1.title === 'First', d1 && d1.title);

    dialog.dismissDialog(d1.id, true);
    await tick();
    check('first resolved true', order[0] === 'A=true', order.join(','));

    const d2 = dialog.getDialog();
    check('second promoted to visible', !!d2 && d2.title === 'Second', d2 && d2.title);
    dialog.dismissDialog(d2.id, false);
    await tick();
    check('second resolved false', order[1] === 'B=false', order.join(','));

    const d3 = dialog.getDialog();
    check('third (alert) promoted to visible', !!d3 && d3.title === 'Third', d3 && d3.title);
    check('alert exposes an OK label for the host', d3.confirmText === 'OK', String(d3.confirmText));
    dialog.dismissDialog(d3.id, true);
    await tick();
    check('queue drained back to empty', dialog.getDialog() === null);

    await Promise.all([p1, p2, p3]);
    check('all three settled in call order', order.join(',') === 'A=true,B=false,C=true', order.join(','));

    let settled = 0;
    const p = dialog.confirmDialog({ title: 'X', message: 'y' }).then(() => { settled++; });
    const dx = dialog.getDialog();
    dialog.dismissDialog(dx.id, true);
    dialog.dismissDialog(dx.id, true);
    dialog.dismissDialog(9999, true);
    await tick(); await tick();
    check('stale / duplicate dismiss ignored (settled exactly once)', settled === 1, 'settled ' + settled + 'x');
    await p;
  }

  console.log(failures === 0 ? 'ALL PASS\n' : failures + ' FAILURE(S)\n');
  process.exit(failures ? 1 : 0);
})();
