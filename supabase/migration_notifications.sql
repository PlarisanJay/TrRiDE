-- ── Migration: Push Notifications Support ─────────────────────────
-- Run this script in your Supabase SQL Editor to support Expo push notifications.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS push_token text;

COMMENT ON COLUMN public.profiles.push_token IS 'Expo Push Token for sending mobile push notifications';
