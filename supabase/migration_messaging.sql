-- ── Migration: Messaging Upgrades (Media & Reactions) ─────────────
-- Run this script in your Supabase SQL Editor to support image messages and reactions.

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text',
ADD COLUMN IF NOT EXISTS media_url text;

-- Message Reactions Table
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- RLS Policies for message reactions
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read reactions" ON public.message_reactions;
CREATE POLICY "Authenticated users can read reactions"
  ON public.message_reactions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert/update their own reactions" ON public.message_reactions;
CREATE POLICY "Users can insert/update their own reactions"
  ON public.message_reactions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
