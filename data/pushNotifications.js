import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../config/supabase';

// Load expo-notifications safely
let Notifications = null;
try {
  Notifications = require('expo-notifications');
  if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
} catch (e) {
  console.log('expo-notifications load skipped:', e?.message || e);
}

/**
 * Register for push notifications and save the Expo Push Token to the user's profile.
 * Returns the push token string, or null if registration fails.
 */
export const registerForPushNotifications = async (userId) => {
  try {
    if (!Notifications) {
      console.log('[Push] expo-notifications module not available');
      return null;
    }

    // Web is not supported
    if (Platform.OS === 'web') {
      return null;
    }

    // Push notifications only work on physical devices
    if (!Device.isDevice) {
      console.log('[Push] Skipped: not a physical device (emulator/simulator)');
      return null;
    }

    // Set up Android notification channel FIRST (required before token fetch)
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'TriRide Notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#004ac6',
        sound: 'default',
        showBadge: true,
      });
    }

    // Check and request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Permission denied by user');
      return null;
    }

    // Get the Expo Push Token
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn('[Push] No EAS projectId found in app config — push token may fail');
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId || undefined,
    });
    const pushToken = tokenData?.data || null;

    console.log('[Push] Token obtained:', pushToken);

    // Save the token to the user's profile in Supabase
    if (userId && pushToken) {
      const { error } = await supabase
        .from('profiles')
        .update({ push_token: pushToken })
        .eq('id', userId);
      if (error) {
        console.warn('[Push] Failed to save token to profile:', error.message);
      } else {
        console.log('[Push] Token saved to profile for user:', userId);
      }
    }

    return pushToken;
  } catch (err) {
    console.log('[Push] Registration error:', err?.message || err);
    return null;
  }
};

/**
 * Schedule an immediate local notification (shows even when app is in foreground).
 */
export const sendLocalNotification = async (title, body, data = {}) => {
  try {
    if (!Notifications) return;

    const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
    if (isExpoGo && Platform.OS === 'android') return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
      },
      trigger: null, // null = immediate
    });
  } catch (err) {
    console.log('Local notification error:', err?.message || err);
  }
};

/**
 * Send an Expo Push Notification to a user via their saved push token.
 */
export const sendPushToUser = async (userId, title, body, data = {}) => {
  try {
    if (!userId) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', userId)
      .single();

    if (profile?.push_token) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          to: profile.push_token,
          sound: 'default',
          title,
          body,
          data,
          priority: 'high',
          channelId: 'default',
        }),
      }).catch((err) => {
        console.warn('[Push] Error sending push to user:', err);
      });
    }
  } catch (err) {
    console.warn('[Push] sendPushToUser error:', err?.message || err);
  }
};

/**
 * Add a listener for received notifications (foreground).
 */
export const addNotificationReceivedListener = (callback) => {
  try {
    if (!Notifications) return { remove: () => {} };
    return Notifications.addNotificationReceivedListener(callback);
  } catch (e) {
    return { remove: () => {} };
  }
};

/**
 * Add a listener for when a user taps a notification (opens the app).
 */
export const addNotificationResponseListener = (callback) => {
  try {
    if (!Notifications) return { remove: () => {} };
    return Notifications.addNotificationResponseReceivedListener(callback);
  } catch (e) {
    return { remove: () => {} };
  }
};
