// Supabase Edge Function: send-announcement-push
// Receives the announcements INSERT Database Webhook payload and sends Expo
// push notifications to the targeted approved students/drivers.
//
// Required secrets:
//   ANNOUNCEMENT_WEBHOOK_SECRET  shared with the Database Webhook x-webhook-secret header
//   EXPO_ACCESS_TOKEN            optional, only when Expo Enhanced Push Security is enabled
//
// The hosted Edge Function environment provides SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const WEBHOOK_SECRET = Deno.env.get('ANNOUNCEMENT_WEBHOOK_SECRET') || '';
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') || '';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_BATCH_SIZE = 100;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!WEBHOOK_SECRET) {
    console.error('ANNOUNCEMENT_WEBHOOK_SECRET is not configured');
    return json({ error: 'Server is not configured' }, 500);
  }

  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const payload = await req.json().catch(() => null);
    const record = payload?.record;

    if (!record?.id || !record?.title || !record?.body || !record?.audience) {
      return json({ error: 'Invalid announcement record' }, 400);
    }

    if (record.is_active !== true) {
      return json({ ok: true, skipped: 'inactive', announcementId: record.id });
    }

    if (record.ends_at && new Date(record.ends_at).getTime() < Date.now()) {
      return json({ ok: true, skipped: 'ended', announcementId: record.id });
    }

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error('Supabase service credentials are not configured');
      return json({ error: 'Server is not configured' }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    let query: any = supabase
      .from('profiles')
      .select('id, push_token')
      .eq('status', 'approved');

    if (record.audience === 'students') {
      query = query.eq('role', 'student');
    } else if (record.audience === 'drivers') {
      query = query.eq('role', 'driver');
    } else if (record.audience === 'all') {
      query = query.in('role', ['student', 'driver']);
    } else {
      return json({ error: 'Invalid audience' }, 400);
    }

    const { data: profiles, error } = await query;

    if (error) {
      console.error('Failed to load target profiles', error);
      return json({ error: 'Failed to load target profiles' }, 500);
    }

    const tokens = Array.from(
      new Set(
        (profiles || [])
          .map((profile) => profile.push_token)
          .filter(
            (token): token is string =>
              typeof token === 'string' && token.startsWith('ExponentPushToken['),
          ),
      ),
    );

    const messages = tokens.map((token) => ({
      to: token,
      sound: 'default',
      title: record.title,
      body: record.body,
      priority: 'high',
      channelId: 'default',
      data: {
        screen: 'Notifications',
        type: 'announcement',
        announcementId: record.id,
      },
    }));

    const expoHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (EXPO_ACCESS_TOKEN) {
      expoHeaders.Authorization = `Bearer ${EXPO_ACCESS_TOKEN}`;
    }

    let sent = 0;
    let failed = 0;
    const invalidTokens = new Set<string>();

    for (let offset = 0; offset < messages.length; offset += MAX_BATCH_SIZE) {
      const chunk = messages.slice(offset, offset + MAX_BATCH_SIZE);

      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: expoHeaders,
        body: JSON.stringify(chunk),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        failed += chunk.length;
        console.error('Expo push request failed', response.status, result);
        continue;
      }

      const tickets = Array.isArray(result?.data) ? result.data : [];

      if (tickets.length === 0) {
        failed += chunk.length;
        console.error('Expo push returned no tickets', result);
        continue;
      }

      if (tickets.length < chunk.length) {
        failed += chunk.length - tickets.length;
      }

      tickets.forEach((ticket: any, index: number) => {
        if (ticket?.status === 'ok') {
          sent += 1;
          return;
        }

        failed += 1;

        if (ticket?.details?.error === 'DeviceNotRegistered') {
          const token = chunk[index]?.to;
          if (token) invalidTokens.add(token);
        }
      });
    }

    // Best-effort cleanup: an unregistered device should not keep receiving
    // failed pushes forever. This only touches the token that Expo rejected.
    if (invalidTokens.size > 0) {
      const { error: cleanupError } = await supabase
        .from('profiles')
        .update({ push_token: null })
        .in('push_token', Array.from(invalidTokens));

      if (cleanupError) {
        console.warn('Failed to clear invalid push tokens', cleanupError);
      }
    }

    const summary = {
      ok: true,
      announcementId: record.id,
      audience: record.audience,
      targeted: profiles?.length || 0,
      withTokens: tokens.length,
      sent,
      failed,
    };

    console.log('Announcement push summary', summary);

    return json(summary);
  } catch (error) {
    console.error('send-announcement-push error', error);
    return json({ error: 'Internal error' }, 500);
  }
});
