-- ── Migration: Supabase Storage Buckets & Policies ───────────────────
-- Run this script in your Supabase SQL Editor to enable avatar & chat image uploads.

-- 1. Ensure public storage buckets exist and are publicly accessible
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('avatars', 'avatars', true),
  ('message', 'message', true),
  ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Avatars Bucket Policies (Uploads, Upserts, and Downloads)
DROP POLICY IF EXISTS "Allow public uploads to avatars bucket" ON storage.objects;
CREATE POLICY "Allow public uploads to avatars bucket"
ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Allow public updates to avatars bucket" ON storage.objects;
CREATE POLICY "Allow public updates to avatars bucket"
ON storage.objects FOR UPDATE TO public
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Allow public downloads from avatars bucket" ON storage.objects;
CREATE POLICY "Allow public downloads from avatars bucket"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');

-- 3. Message Bucket Policies (Fallback bucket)
DROP POLICY IF EXISTS "Allow public uploads to message bucket" ON storage.objects;
CREATE POLICY "Allow public uploads to message bucket"
ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id = 'message');

DROP POLICY IF EXISTS "Allow public updates to message bucket" ON storage.objects;
CREATE POLICY "Allow public updates to message bucket"
ON storage.objects FOR UPDATE TO public
USING (bucket_id = 'message')
WITH CHECK (bucket_id = 'message');

DROP POLICY IF EXISTS "Allow public downloads from message bucket" ON storage.objects;
CREATE POLICY "Allow public downloads from message bucket"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'message');

-- 4. Chat-Media Bucket Policies
DROP POLICY IF EXISTS "Allow public uploads to chat-media bucket" ON storage.objects;
CREATE POLICY "Allow public uploads to chat-media bucket"
ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "Allow public updates to chat-media bucket" ON storage.objects;
CREATE POLICY "Allow public updates to chat-media bucket"
ON storage.objects FOR UPDATE TO public
USING (bucket_id = 'chat-media')
WITH CHECK (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "Allow public downloads from chat-media bucket" ON storage.objects;
CREATE POLICY "Allow public downloads from chat-media bucket"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'chat-media');
