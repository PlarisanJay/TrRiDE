import { supabase } from '../config/supabase';

// ── Auth: Sign Up ──────────────────────────────────────────────
export const signUp = async ({ email, password, full_name, phone, role }) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, phone, role },
    },
  });

  if (error) throw error;
  return data;
};

// ── Auth: Sign In ──────────────────────────────────────────────
export const signIn = async ({ email, password }) => {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) throw authError;

  // Fetch the user's profile to check status
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) throw new Error('Profile not found. Please contact support.');

  if (profile.status === 'pending') {
    await supabase.auth.signOut();
    throw new Error('Your account is pending admin approval. Please wait for an administrator to verify your account before logging in.');
  }

  if (profile.status === 'rejected') {
    await supabase.auth.signOut();
    throw new Error('Your account has been rejected. Please contact support for more information.');
  }

  return { user: authData.user, profile };
};

// ── Auth: Sign Out ─────────────────────────────────────────────
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

// ── Auth: Get Current Session ──────────────────────────────────
export const getCurrentSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
};

// ── Profile: Get Current User Profile ──────────────────────────
export const getCurrentProfile = async () => {
  const session = await getCurrentSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data;
};

// ── Profile: Get Profile by ID ─────────────────────────────────
export const getProfileById = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Profile not found.');
  return data;
};

// ── Admin: Get Pending Users ───────────────────────────────────
export const getPendingUsers = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
};

// ── Admin: Get All Users ───────────────────────────────────────
export const getAllUsers = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
};

// ── Admin: Approve User ────────────────────────────────────────
export const approveUser = async (userId) => {
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'approved' })
    .eq('id', userId);

  if (error) throw error;
};

// ── Admin: Reject User ─────────────────────────────────────────
export const rejectUser = async (userId) => {
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'rejected' })
    .eq('id', userId);

  if (error) throw error;
};

// ── Admin: Get User Stats ──────────────────────────────────────
export const getUserStats = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, status');

  if (error) throw error;

  const total = data.filter((u) => u.status === 'approved').length;
  const pending = data.filter((u) => u.status === 'pending').length;
  const students = data.filter((u) => u.role === 'student' && u.status === 'approved').length;
  const drivers = data.filter((u) => u.role === 'driver' && u.status === 'approved').length;

  return { total, pending, students, drivers };
};
