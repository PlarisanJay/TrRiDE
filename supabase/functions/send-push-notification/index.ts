import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const payload = await req.json();
    const { record } = payload; // Trigger payload from Supabase Database Webhook

    if (!record) {
      return new Response(JSON.stringify({ error: "No record provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Determine the push token and message details based on the webhook record
    const pushToken = record.push_token || record.recipient_push_token;
    const title = record.title || "TriRide Alert 🚗";
    const body = record.body || record.message || "You have a new update in TriRide!";

    if (!pushToken) {
      return new Response(
        JSON.stringify({ message: "No push_token present in record, skipped." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Send push notification via Expo Push API (100% Free)
    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        to: pushToken,
        sound: "default",
        title,
        body,
        data: { recordId: record.id },
      }),
    });

    const result = await expoResponse.json();

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
