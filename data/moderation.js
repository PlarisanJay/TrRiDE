import { supabase } from '../config/supabase';

export const getActiveModeration = async (userId) => {
  if (!userId) return null;
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('user_moderations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return null;
    for (const m of data || []) {
      if (m.action === 'ban') return m;
      if (m.action === 'suspend') {
        if (!m.expires_at || m.expires_at > now) return m;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const applyModeration = async ({ userId, adminId, action, reason = '', expiresAt = null }) => {
  const { data, error } = await supabase
    .from('user_moderations')
    .insert({
      user_id: userId,
      admin_id: adminId,
      action,
      reason: reason || '',
      expires_at: expiresAt,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const liftModeration = async ({ userId, adminId, reason = '' }) => {
  const { data, error } = await supabase
    .from('user_moderations')
    .insert({
      user_id: userId,
      admin_id: adminId,
      action: 'lift',
      reason: reason || '',
      expires_at: null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};
