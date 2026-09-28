// Supabase Edge Function: notify-approval
// Handles notifying user when their account is approved via:
//  1. Expo Push Notification (real-time phone alert, free, works even app is closed)
//  2. Email via Resend
//  3. SMS via Semaphore (Philippines)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Secrets are set with:  supabase secrets set RESEND_API_KEY=... SEMAPHORE_API_KEY=... FROM_EMAIL=...
// Never hardcode a real key here — this file may be committed.
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const SEMAPHORE_API_KEY = Deno.env.get('SEMAPHORE_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'TriRide <onboarding@resend.dev>';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json().catch(() => ({}));

    // Handle both direct invocation and Supabase Database Webhooks
    // Direct invocation body: { record: { email, phone, push_token, full_name, role, username, ... } }
    // DB Webhook payload: { type, table, record, old_record, schema }
    const record = payload.record || payload.user || payload;
    const oldRecord = payload.old_record;

    // If triggered by a DB webhook update, only notify when newly transitioned to 'approved'
    if (oldRecord && (record.status !== 'approved' || oldRecord.status === 'approved')) {
      return new Response(JSON.stringify({ message: 'No notification needed; status was not newly approved.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const toEmail = record.email;
    const toPhone = record.phone;
    const pushToken = record.push_token;
    const fullName = record.full_name || 'TriRide User';
    const role = record.role === 'driver' ? 'Driver' : 'Student';
    const username = record.username ? `@${record.username}` : '';

    const results: Record<string, any> = {
      push: null,
      email: null,
      sms: null,
    };

    // ── 1. EXPO PUSH NOTIFICATION (real-time, free, works even if app is closed) ──
    if (pushToken) {
      try {
        const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
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
        });
        const expoData = await expoRes.json();
        results.push = { status: expoRes.status, data: expoData };
      } catch (err: any) {
        results.push = { error: err?.message || 'Push delivery failed' };
      }
    }

    // ── 2. SEND EMAIL NOTIFICATION (Resend) ──────────────────────────────────
    if (toEmail && RESEND_API_KEY) {
      try {
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f6f8fb; margin: 0; padding: 24px; }
              .container { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
              .header { background: #0066cc; padding: 28px; text-align: center; }
              .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; }
              .body { padding: 32px 28px; color: #1e293b; line-height: 1.6; }
              .badge { display: inline-block; background: #e0f2fe; color: #0284c7; font-weight: 700; padding: 4px 12px; border-radius: 12px; font-size: 13px; margin-bottom: 16px; }
              .greeting { font-size: 18px; font-weight: 700; margin-bottom: 12px; color: #0f172a; }
              .message { font-size: 15px; color: #475569; margin-bottom: 24px; }
              .info-box { background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; padding: 16px 20px; margin-bottom: 24px; }
              .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
              .info-label { color: #64748b; font-weight: 500; }
              .info-val { color: #0f172a; font-weight: 600; }
              .footer { padding: 20px 28px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; background: #fafafa; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>TriRide</h1>
              </div>
              <div class="body">
                <span class="badge">Account Approved</span>
                <div class="greeting">Hello, ${fullName}!</div>
                <p class="message">
                  Great news! Your <strong>TriRide ${role}</strong> registration has been reviewed and officially approved by the campus administrator.
                </p>
                <div class="info-box">
                  <div class="info-row"><span class="info-label">Account Role:</span> <span class="info-val">${role}</span></div>
                  ${username ? `<div class="info-row"><span class="info-label">Username:</span> <span class="info-val">${username}</span></div>` : ''}
                  <div class="info-row"><span class="info-label">Status:</span> <span class="info-val" style="color: #16a34a;">Approved & Active</span></div>
                </div>
                <p class="message">
                  You can now open the TriRide mobile app and log in using your <strong>Username</strong> to start booking rides!
                </p>
              </div>
              <div class="footer">
                © 2026 TriRide Technologies Inc. • Campus Transportation Partner
              </div>
            </div>
          </body>
          </html>
        `;

        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [toEmail],
            subject: `🎉 Your TriRide ${role} Account Has Been Approved!`,
            html: emailHtml,
          }),
        });

        const resendData = await resendRes.json();
        results.email = { status: resendRes.status, data: resendData };
      } catch (err: any) {
        results.email = { error: err?.message || 'Email delivery failed' };
      }
    }

    // ── 3. SEND SMS NOTIFICATION (Semaphore Philippines) ─────────────────────
    if (toPhone && SEMAPHORE_API_KEY) {
      try {
        const smsMessage = `TriRide: Great news ${fullName}! Your ${role} account has been APPROVED. You can now log in using your username and enjoy the ride!`;
        const semaphoreRes = await fetch('https://api.semaphore.co/api/v4/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            apikey: SEMAPHORE_API_KEY,
            number: toPhone,
            message: smsMessage,
            sendername: 'TRIRIDE',
          }),
        });
        const smsData = await semaphoreRes.json();
        results.sms = { status: semaphoreRes.status, data: smsData };
      } catch (err: any) {
        results.sms = { error: err?.message || 'SMS delivery failed' };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Approval notification processed for ${fullName}`,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
