-- ── Migration: Messages DELETE Policy ───────────────────────────────
-- Allows message senders to delete their own messages.
-- Run this in your Supabase SQL Editor.

DROP POLICY IF EXISTS "Senders can delete own messages" ON messages;
CREATE POLICY "Senders can delete own messages" ON messages
  FOR DELETE USING (
    sender_id = auth.uid()
  );

-- Also allow conversation participants to delete conversations
DROP POLICY IF EXISTS "Participants can delete conversations" ON conversations;
CREATE POLICY "Participants can delete conversations" ON conversations
  FOR DELETE USING (
    student_id = auth.uid() OR driver_id = auth.uid()
  );

-- Allow deleting messages within your own conversations
DROP POLICY IF EXISTS "Participants can delete conversation messages" ON messages;
CREATE POLICY "Participants can delete conversation messages" ON messages
  FOR DELETE USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE student_id = auth.uid() OR driver_id = auth.uid()
    )
  );
