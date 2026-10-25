import { supabase } from '../config/supabase';

export const getActiveAnnouncements = async (role = null) => {
  try {
    const now = new Date().toISOString();
    let query = supabase
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .lte('starts_at', now)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    if (!role) return data || [];
    return (data || []).filter((a) => a.audience === 'all' || a.audience === role);
  } catch (e) {
    console.warn('getActiveAnnouncements error:', e.message);
    return [];
  }
};

export const createAnnouncement = async ({ title, body, audience = 'all', createdBy, isActive = true, startsAt = null, endsAt = null }) => {
  const { data, error } = await supabase
    .from('announcements')
    .insert({
      title,
      body,
      audience,
      created_by: createdBy,
      is_active: isActive,
      starts_at: startsAt || new Date().toISOString(),
      ends_at: endsAt || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateAnnouncement = async (id, updates) => {
  const { data, error } = await supabase
    .from('announcements')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteAnnouncement = async (id) => {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw error;
  return true;
};
