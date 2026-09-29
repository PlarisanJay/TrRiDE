import { Platform } from 'react-native';
import { supabase } from '../config/supabase';


// ── Auth: Check Username Available ────────────────────────────
export const checkUsernameAvailable = async (username) => {
  if (!username) return true;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', username.trim())
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      return true;
    }
    return !data;
  } catch (e) {
    return true;
  }
};

// ── Auth: Sign Up ──────────────────────────────────────────────
export const signUp = async ({
  email,
  password,
  full_name,
  phone,
  role,
  username,
  student_id,
  license_no,
  plate_number,
}) => {
  const cleanUsername = (username || '').trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name,
        phone,
        role,
        username: cleanUsername,
        student_id: student_id || '',
        license_no: license_no || '',
        plate_number: plate_number || '',
      },
    },
  });

  if (error) throw error;

  // Immediate profile sync to ensure custom fields are saved even if database trigger is not yet updated
  if (data?.user?.id) {
    try {
      await supabase
        .from('profiles')
        .update({
          username: cleanUsername || null,
          student_id: student_id || null,
          license_no: license_no || null,
          plate_number: plate_number || null,
          phone: phone || null,
          full_name: full_name || null,
        })
        .eq('id', data.user.id);
    } catch (e) {
      // Handled by trigger if available
    }
  }

  return data;
};

const withTimeout = (promise, timeoutMs = 20000, errorMsg = 'Request timed out') => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
    ),
  ]);
};

// Retry a factory function up to `retries` times on network/timeout errors.
// Uses a factory (not a Promise) so each attempt creates a fresh request —
// a Promise that already timed out cannot be retried.
const withRetry = async (factory, { retries = 2, timeoutMs = 20000, errorMsg = 'Request timed out', delayMs = 1000 } = {}) => {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await withTimeout(factory(), timeoutMs, errorMsg);
    } catch (err) {
      lastErr = err;
      const isNetworkError =
        err?.message?.includes('timed out') ||
        err?.message?.includes('fetch') ||
        err?.message?.includes('network') ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('NetworkError');
      // Only retry on network / timeout errors, not auth errors
      if (!isNetworkError || attempt >= retries) break;
      await new Promise((res) => setTimeout(res, delayMs * (attempt + 1)));
    }
  }
  throw lastErr;
};

// ── Auth: Sign In (Allows Username OR Gmail) ───────────────────
export const signIn = async ({ email, identifier, password }) => {
  const loginInput = (identifier || email || '').trim();
  let resolvedEmail = loginInput;

  // If user entered a username (does not contain '@')
  if (!loginInput.includes('@')) {
    const { data: userProfile, error: profileErr } = await withRetry(
      () => supabase
        .from('profiles')
        .select('email')
        .ilike('username', loginInput)
        .maybeSingle(),
      { timeoutMs: 15000, errorMsg: 'Username lookup timed out', retries: 2 }
    ).catch(() => ({ data: null, error: null }));

    if (profileErr) {
      console.warn('Username lookup error:', profileErr.message);
    }

    if (!userProfile?.email) {
      throw new Error(
        'No account found with that username. You can also log in using your registered Gmail address.'
      );
    }
    resolvedEmail = userProfile.email;
  }

  resolvedEmail = resolvedEmail.toLowerCase().trim();

  const { data: authData, error: authError } = await withRetry(
    () => supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    }),
    {
      timeoutMs: 25000,
      errorMsg: 'Login timed out. Please check your internet connection and try again.',
      retries: 2,
      delayMs: 1500,
    }
  );

  if (authError) throw authError;

  // Fetch the user's profile to check status
  const profile = await getCurrentProfile(authData.session);

  if (!profile) throw new Error('Profile not found. Please contact support.');

  if (profile.status === 'pending') {
    await supabase.auth.signOut().catch(() => {});
    throw new Error('Your account is pending admin approval. Please wait for an administrator to verify your account before logging in.');
  }

  if (profile.status === 'rejected') {
    await supabase.auth.signOut().catch(() => {});
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
  try {
    const { data: { session }, error } = await withTimeout(
      supabase.auth.getSession(),
      10000,
      'Get session timed out'
    );
    if (error) throw error;
    return session;
  } catch (e) {
    return null;
  }
};

// ── Profile: Get Current User Profile ──────────────────────────
export const getCurrentProfile = async (sessionParam = null) => {
  try {
    const session = sessionParam || (await getCurrentSession());
    if (!session?.user?.id) return null;

    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle(),
      12000,
      'Profile fetch timed out'
    );

    if (error) throw error;
    if (!data) return null;
    return data;
  } catch (e) {
    console.warn('getCurrentProfile error:', e.message);
    return null;
  }
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
export const approveUser = async (userId, userRecord = null) => {
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'approved' })
    .eq('id', userId);

  if (error) throw error;

  // Fetch the latest profile (includes push_token saved at registration/login)
  let targetProfile = userRecord;
  if (!targetProfile || !targetProfile.email || !targetProfile.push_token) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    targetProfile = data;
  }

  if (targetProfile) {
    const fullName = targetProfile.full_name || 'User';
    const role = targetProfile.role === 'driver' ? 'Driver' : 'Student';

    // ── 1. Expo Push Notification (real-time, works even app is closed) ──
    const pushToken = targetProfile.push_token;
    if (pushToken) {
      fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          to: pushToken,
          sound: 'default',
          title: `🎉 Account Approved!`,
          body: `Congratulations, ${fullName}! Your TriRide ${role} account has been approved. You can now log in and enjoy the ride!`,
          data: { screen: 'Login', type: 'approval' },
          priority: 'high',
          channelId: 'default',
        }),
      }).catch((err) => {
        console.warn('[Approval] Push notification failed:', err);
      });
    }

    // ── 2. Email / SMS via Supabase Edge Function ──
    // The Resend + Semaphore keys live in Edge Function secrets (Deno.env), never
    // in the client bundle. Do not reintroduce a client-side key fallback here.
    supabase.functions
      .invoke('notify-approval', {
        body: { record: { ...targetProfile, status: 'approved' } },
      })
      .catch((err) => {
        console.warn('[Approval] notify-approval invocation failed:', err);
      });
  }
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

// ── Profile: Update User Profile ────────────────────────────────
export const updateUserProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ── Profile: Base64 to ArrayBuffer Helper ───────────────────────
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(256);
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;
}

export function decodeBase64ToArrayBuffer(base64) {
  if (!base64 || typeof base64 !== 'string') return new ArrayBuffer(0);
  const clean = base64.replace(/[\r\n\t ]/g, '');
  let bufferLength = clean.length * 0.75;
  const len = clean.length;
  if (clean[len - 1] === '=') {
    bufferLength--;
    if (clean[len - 2] === '=') bufferLength--;
  }
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const enc1 = B64_LOOKUP[clean.charCodeAt(i)];
    const enc2 = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const enc3 = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const enc4 = B64_LOOKUP[clean.charCodeAt(i + 3)];
    bytes[p++] = (enc1 << 2) | (enc2 >> 4);
    if (clean[i + 2] !== '=') bytes[p++] = ((enc2 & 15) << 4) | (enc3 >> 2);
    if (clean[i + 3] !== '=') bytes[p++] = ((enc3 & 3) << 6) | (enc4 & 63);
  }
  return bytes.buffer;
}

export async function imageUriToArrayBuffer(imageUri, base64Data = null) {
  // 1. If direct base64 provided from ImagePicker
  if (base64Data && typeof base64Data === 'string' && base64Data.length > 0) {
    return decodeBase64ToArrayBuffer(base64Data);
  }

  // 2. If data URI
  if (typeof imageUri === 'string' && imageUri.startsWith('data:')) {
    const commaIndex = imageUri.indexOf(',');
    if (commaIndex !== -1) {
      return decodeBase64ToArrayBuffer(imageUri.slice(commaIndex + 1));
    }
  }

  // 3. On Web: fetch(blobUrl).arrayBuffer() works natively
  if (Platform.OS === 'web') {
    try {
      const res = await fetch(imageUri);
      return await res.arrayBuffer();
    } catch (e) {
      console.warn('Web fetch image error:', e);
    }
  }

  // 4. On Native (Expo Go / Android / iOS): read file as base64
  try {
    const FileSystem = require('expo-file-system');
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: 'base64',
    });
    if (base64) {
      return decodeBase64ToArrayBuffer(base64);
    }
  } catch (fsErr) {
    console.warn('FileSystem readAsStringAsync failed, falling back:', fsErr);
  }

  // Fallback to fetch
  try {
    const response = await fetch(imageUri);
    const buf = await response.arrayBuffer();
    if (buf && buf.byteLength > 0) return buf;
  } catch (err) {
    console.warn('Fetch fallback error:', err);
  }

  return new ArrayBuffer(0);
}

// ── Profile: Upload Avatar to Supabase Storage ──────────────────
export const uploadAvatar = async (userId, imageUri, base64Data = null) => {
  try {
    const arrayBuffer = await imageUriToArrayBuffer(imageUri, base64Data);

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error('Image data was empty or could not be read.');
    }

    const fileExt = (imageUri && typeof imageUri === 'string')
      ? imageUri.split('.').pop()?.split('?')[0] || 'jpg'
      : 'jpg';
    // Object key is <userId>/<timestamp>.<ext>. The first path segment must
    // be the uploader's own uid: the storage write policies in
    // supabase/migration_security_web.sql enforce
    //     (storage.foldername(name))[1] = auth.uid()::text
    // The previous key was `avatars/<userId>_<ts>.<ext>`, whose first
    // segment was the literal "avatars", so the database now rejects it.
    // The uid was only a filename prefix there, which is not a real scope —
    // any user could have written to any other user's prefix.
    //
    // This key is relative to the bucket (passed via .from(bucketName)
    // below), so it correctly does NOT repeat the bucket name.
    const filePath = `${userId}/${Date.now()}.${fileExt}`;
    const contentType = `image/${fileExt.toLowerCase() === 'png' ? 'png' : 'jpeg'}`;

    // Try uploading to 'avatars' bucket first; if missing, fallback to 'message' bucket
    let bucketName = 'avatars';
    let uploadRes = await supabase.storage
      .from(bucketName)
      .upload(filePath, arrayBuffer, { contentType, upsert: true });

    if (uploadRes.error && (uploadRes.error.message?.includes('not found') || uploadRes.error.statusCode === '404')) {
      bucketName = 'message'; // Use the public 'message' bucket visible in Supabase dashboard
      uploadRes = await supabase.storage
        .from(bucketName)
        .upload(filePath, arrayBuffer, { contentType, upsert: true });
    }

    if (uploadRes.error) throw uploadRes.error;

    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) throw new Error('Could not get public URL');

    // Update the profile with the new avatar URL
    await updateUserProfile(userId, { avatar_url: publicUrl });

    return publicUrl;
  } catch (err) {
    console.warn('Avatar upload error:', err.message);
    throw err;
  }
};

// ── Profile: Set online status ────────────────────────────────
export const setDriverOnlineStatus = async (userId, isOnline) => {
  const { error } = await supabase
    .from('profiles')
    .update({ is_online: isOnline })
    .eq('id', userId);

  if (error) throw error;
};

// ── Auth: Reset Password (Accepts Gmail, Username, or Mobile) ──
export const resetPassword = async (identifier) => {
  const input = (identifier || '').trim();
  if (!input) {
    throw new Error('Please enter your Gmail address, username, or mobile number.');
  }

  let targetEmail = input;

  // If input is not an email, lookup email by username or phone
  if (!input.includes('@')) {
    const isPhone = /^[0-9+]+$/.test(input);
    const query = supabase.from('profiles').select('email');

    const { data: profile, error } = isPhone
      ? await query.eq('phone', input).maybeSingle()
      : await query.ilike('username', input).maybeSingle();

    if (error || !profile?.email) {
      throw new Error(
        isPhone
          ? 'No account found with that mobile number. Please check or enter your registered Gmail.'
          : 'No account found with that username. Please check or enter your registered Gmail.'
      );
    }
    targetEmail = profile.email;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
    redirectTo: 'triride://reset-password',
  });

  if (error) throw error;
  return targetEmail;
};

