import React, { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { subscribeDialog, getDialog, dismissDialog } from '../lib/dialog';

/**
 * Renders whatever dialog `lib/dialog` currently has queued.
 *
 * Mounted once at the root of App.js (outside AppRouter so it is never
 * inside an Animated.View that creates a stacking context on web).
 *
 * Returns null on native — the real `Alert` is used there instead.
 *
 * On web we use 100% plain HTML elements with inline styles so that React
 * Native Web's pointer-event and stacking-context overrides cannot interfere
 * with button clicks.
 */

const useDialog = () => useSyncExternalStore(subscribeDialog, getDialog, getDialog);

function WebDialogHost() {
  const dialog = useDialog();

  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismissDialog(dialog.id, dialog.kind === 'alert' ? true : false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  if (!dialog) return null;

  const close = (value) => dismissDialog(dialog.id, value);
  const isConfirm = dialog.kind === 'confirm';
  const isDestructive = !!dialog.destructive;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        zIndex: 999999,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close(isConfirm ? false : true);
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {!!dialog.title && (
          <h2
            id="dialog-title"
            style={{
              margin: 0,
              fontSize: '17px',
              fontWeight: '700',
              color: '#0f172a',
              letterSpacing: '-0.2px',
            }}
          >
            {dialog.title}
          </h2>
        )}

        {!!dialog.message && (
          <p
            style={{
              margin: '4px 0 16px',
              fontSize: '15px',
              lineHeight: '1.5',
              color: '#475569',
              whiteSpace: 'pre-wrap',
            }}
          >
            {Array.isArray(dialog.message) ? dialog.message.join('\n') : dialog.message}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: '8px',
            marginTop: '4px',
          }}
        >
          {isConfirm && (
            <button
              type="button"
              onClick={() => close(false)}
              style={{
                padding: '10px 20px',
                borderRadius: '999px',
                border: 'none',
                background: 'transparent',
                fontSize: '15px',
                fontWeight: '600',
                color: '#64748b',
                cursor: 'pointer',
                minWidth: '88px',
                fontFamily: 'inherit',
              }}
            >
              {dialog.cancelText || 'Cancel'}
            </button>
          )}

          <button
            type="button"
            onClick={() => close(true)}
            style={{
              padding: '10px 20px',
              borderRadius: '999px',
              border: 'none',
              backgroundColor: isDestructive ? '#dc2626' : '#2563eb',
              color: '#ffffff',
              fontSize: '15px',
              fontWeight: '700',
              cursor: 'pointer',
              minWidth: '88px',
              fontFamily: 'inherit',
            }}
          >
            {dialog.confirmText || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DialogHost() {
  if (Platform.OS !== 'web') return null;
  return <WebDialogHost />;
}


