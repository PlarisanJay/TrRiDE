import { supabase } from '../config/supabase';
import { sendPushToUser } from './pushNotifications';

export const createNotification = async ({ userId, type, title, body = '', data = {} }) => {
  if (!userId || !title) return null;
  try {
    const { data: notif, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        body,
        data: data || {},
      })
      .select()
      .single();
    if (error) throw error;
    // Also send push in parallel (best effort)
    try {
      await sendPushToUser(userId, title, body, { ...(data || {}), notificationId: notif?.id });
    } catch (e) {}
    return notif;
  } catch (err) {
    console.warn('createNotification error:', err.message);
    return null;
  }
};

export const getNotifications = async (userId, limit = 50) => {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('getNotifications error:', e.message);
    return [];
  }
};

export const markNotificationRead = async (notificationId) => {
  if (!notificationId) return;
  try {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId);
  } catch (e) {}
};

export const markAllNotificationsRead = async (userId) => {
  if (!userId) return;
  try {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);
  } catch (e) {}
};

export const getUnreadNotificationCount = async (userId) => {
  if (!userId) return 0;
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) return 0;
    return count || 0;
  } catch (e) {
    return 0;
  }
};
