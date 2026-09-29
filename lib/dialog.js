import { Alert, Platform } from 'react-native';

/**
 * Cross-platform dialog shim.
 *
 * WHY THIS EXISTS
 * ---------------
 * `react-native-web` ships `Alert` as literally this:
 *
 *     class Alert { static alert() {} }
 *
 * (node_modules/react-native-web/dist/exports/Alert/index.js)
 *
 * It is a no-op with no warning. The app had 46 `Alert.alert(...)` call
 * sites, so on web every one of them vanished silently. 8 of them carried
 * an `onPress` handler, which turned those flows into dead ends: tapping
 * "Delete" / "Cancel" did nothing at all and the user was stuck.
 *
 * The fix is to route every dialog through here, where native still gets
 * the real `Alert` and web gets a themed modal.
 *
 * THE IMPORTANT SUBTLETY — do not "fix" alertDialog to await a press
 * --------------------------------------------------------------------
 * `alertDialog` resolves *immediately* on native, and that is deliberate.
 * A React Native `Alert` with no buttons auto-dismisses by itself; it
 * never fires a button press. If the promise only resolved on a press it
 * would never settle, so every `await alertDialog(...)` followed by more
 * code would deadlock the screen on the phone. Resolving immediately keeps
 * native behaviour byte-identical to the plain `Alert.alert` it replaces.
 *
 * `confirmDialog` is the opposite: native always gets explicit
 * cancel/confirm buttons, so awaiting a press is both correct and exactly
 * what the old `onPress` handler did.
 */

const isWeb = Platform.OS === 'web';

// ── Web store ────────────────────────────────────────────────────────────────
// At most one dialog is visible at a time. Extra requests queue in call
// order rather than stacking modals, which is what a user expects when two
// alerts fire from the same action.
let current = null;
let queue = [];
let nextId = 1;
const listeners = new Set();

const emit = () => {
  for (const l of listeners) l();
};

const pump = () => {
  if (current || queue.length === 0) return;
  current = queue.shift();
  emit();
};

const present = (spec) =>
  new Promise((resolve) => {
    queue.push({ ...spec, id: nextId++, resolve });
    pump();
  });

// ── Store plumbing, consumed by components/DialogHost.js ────────────────────
export const subscribeDialog = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getDialog = () => current;

export const dismissDialog = (id, value) => {
  // Ignore a stale id: a dialog can in principle be dismissed twice if a
  // backdrop press and a button press land in the same frame.
  if (!current || current.id !== id) return;
  const { resolve } = current;
  current = null;
  emit(); // Notify listeners immediately so the dialog disappears right away.
           // pump() only calls emit() when there is a NEXT dialog to show,
           // so without this line the dialog stays visible when the queue is empty.
  resolve(value);
  pump();
};

// ── Public API ───────────────────────────────────────────────────────────────

/** A single-button notice. */
export const alertDialog = ({ title, message, confirmText = 'OK' } = {}) => {
  if (!isWeb) {
    Alert.alert(title, message);
    return Promise.resolve();
  }
  return present({ kind: 'alert', title, message, confirmText });
};

/**
 * A notice the user must acknowledge before an action runs.
 *
 * Deliberately distinct from alertDialog. alertDialog resolves immediately
 * on native (a button-less RN Alert auto-dismisses and never fires a press),
 * which is right for a fire-and-forget notice but wrong where the original
 * code was `Alert.alert(t, m, [{ text: 'OK', onPress: goSomewhere }])` and
 * the navigation only happened if the user tapped OK.
 *
 * Call sites become:
 *     await notifyDialog({ title, message });
 *     onCancelTrip();
 * which on native shows the same single OK button and runs the same action.
 */
export const notifyDialog = ({ title, message, actionText = 'OK' } = {}) => {
  if (!isWeb) {
    return new Promise((resolve) => {
      Alert.alert(title, message, [{ text: actionText, onPress: () => resolve(true) }]);
    });
  }
  return present({ kind: 'alert', title, message, confirmText: actionText });
};

/** Two-button question. Resolves true when confirmed, false when cancelled. */
export const confirmDialog = ({
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancel',
  destructive = false,
} = {}) => {
  if (!isWeb) {
    return new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmText,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ]);
    });
  }
  return present({ kind: 'confirm', title, message, confirmText, cancelText, destructive });
};
