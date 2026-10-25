import { supabase } from '../config/supabase';

export const getBlockedUsers = async (userId) => {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('blocks')
      .select('blocked_id, created_at')
      .eq('blocker_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!data || data.length === 0) return [];
    const blockedIds = data.map((b) => b.blocked_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role')
      .in('id', blockedIds);
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    return data.map((b) => ({ ...b, profile: profileMap.get(b.blocked_id) || null }));
  } catch (err) {
    console.warn('getBlockedUsers error:', err.message);
    return [];
  }
};

export const blockUser = async (blockerId, blockedId) => {
  if (!blockerId || !blockedId || blockerId === blockedId) throw new Error('Invalid block');
  const { data, error } = await supabase
    .from('blocks')
    .insert({ blocker_id: blockerId, blocked_id: blockedId })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const unblockUser = async (blockerId, blockedId) => {
  if (!blockerId || !blockedId) throw new Error('Invalid unblock');
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) throw error;
  return true;
};

export const isBlocked = async (userA, userB) => {
  if (!userA || !userB || userA === userB) return false;
  try {
    const { data, error } = await supabase
      .from('blocks')
      .select('id')
      .or(`and(blocker_id.eq.${userA},blocked_id.eq.${userB}),and(blocker_id.eq.${userB},blocked_id.eq.${userA})`)
      .limit(1);
    if (error) return false;
    return (data || []).length > 0;
  } catch (e) {
    return false;
  }
};

export const getBlockedSet = async (userId) => {
  if (!userId) return new Set();
  try {
    const { data, error } = await supabase
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
    if (error) return new Set();
    const set = new Set();
    (data || []).forEach((b) => {
      if (b.blocker_id === userId) set.add(b.blocked_id);
      if (b.blocked_id === userId) set.add(b.blocker_id);
    });
    return set;
  } catch (e) {
    return new Set();
  }
};
