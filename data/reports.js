import { supabase } from '../config/supabase';

const COOLDOWN_HOURS = 24;

export const canReportUser = async (reporterId, reportedId) => {
  if (!reporterId || !reportedId || reporterId === reportedId) return { allowed: false, reason: 'Invalid user' };
  try {
    const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('reports')
      .select('id, created_at')
      .eq('reporter_id', reporterId)
      .eq('reported_id', reportedId)
      .gte('created_at', cutoff)
      .limit(1);
    if (error) return { allowed: true };
    if (data && data.length > 0) return { allowed: false, reason: `You can report this user again after ${COOLDOWN_HOURS} hours.` };
    return { allowed: true };
  } catch (e) {
    return { allowed: true };
  }
};

export const createReport = async ({ reporterId, reportedId, reason, details = '', evidence = [] }) => {
  const check = await canReportUser(reporterId, reportedId);
  if (!check.allowed) throw new Error(check.reason);
  const { data, error } = await supabase
    .from('reports')
    .insert({
      reporter_id: reporterId,
      reported_id: reportedId,
      reason,
      details: details || '',
      evidence: Array.isArray(evidence) ? evidence : [],
      status: 'open',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getMyReports = async (reporterId) => {
  if (!reporterId) return [];
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('reporter_id', reporterId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('getMyReports error:', e.message);
    return [];
  }
};

export const getReportById = async (reportId) => {
  if (!reportId) return null;
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    return null;
  }
};

export const getReportMessages = async (reportId) => {
  if (!reportId) return [];
  try {
    const { data, error } = await supabase
      .from('report_messages')
      .select('*')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (e) {
    return [];
  }
};

export const sendReportMessage = async (reportId, senderId, content) => {
  if (!reportId || !senderId || !content?.trim()) throw new Error('Invalid message');
  const { data, error } = await supabase
    .from('report_messages')
    .insert({ report_id: reportId, sender_id: senderId, content: content.trim() })
    .select()
    .single();
  if (error) throw error;
  return data;
};
