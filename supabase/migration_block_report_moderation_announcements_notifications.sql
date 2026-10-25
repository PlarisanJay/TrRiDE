-- Migration: Block, Report, Admin Moderation, Announcements, Notification Center
-- Run in Supabase SQL Editor

-- 1) BLOCKS (private, one-way)
CREATE TABLE IF NOT EXISTS public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own blocks" ON public.blocks;
CREATE POLICY "Users manage own blocks" ON public.blocks
  FOR ALL USING (auth.uid() = blocker_id)
  WITH CHECK (auth.uid() = blocker_id);

-- 2) REPORTS
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  evidence jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','dismissed')),
  admin_id uuid REFERENCES auth.users(id),
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter_id <> reported_id)
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reporter can create/view own reports" ON public.reports;
CREATE POLICY "Reporter can create/view own reports" ON public.reports
  FOR SELECT USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Reporter can insert own report" ON public.reports;
CREATE POLICY "Reporter can insert own report" ON public.reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Admin can manage all reports" ON public.reports;
CREATE POLICY "Admin can manage all reports" ON public.reports
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3) REPORT MESSAGES (thread between reporter and admin only)
CREATE TABLE IF NOT EXISTS public.report_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.report_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reporter or admin can read report messages" ON public.report_messages;
CREATE POLICY "Reporter or admin can read report messages" ON public.report_messages
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_id AND r.reporter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Reporter or admin can insert report messages" ON public.report_messages;
CREATE POLICY "Reporter or admin can insert report messages" ON public.report_messages
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_id AND r.reporter_id = auth.uid()
    )
  );

-- 4) USER MODERATIONS (warn/suspend/ban/lift)
CREATE TABLE IF NOT EXISTS public.user_moderations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('warn','suspend','ban','lift')),
  reason text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_moderations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage moderations" ON public.user_moderations;
CREATE POLICY "Admin can manage moderations" ON public.user_moderations
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users can view own moderations" ON public.user_moderations;
CREATE POLICY "Users can view own moderations" ON public.user_moderations
  FOR SELECT USING (auth.uid() = user_id);

-- 5) ANNOUNCEMENTS
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','students','drivers')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view active announcements" ON public.announcements;
CREATE POLICY "Anyone authenticated can view active announcements" ON public.announcements
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

DROP POLICY IF EXISTS "Admin can manage announcements" ON public.announcements;
CREATE POLICY "Admin can manage announcements" ON public.announcements
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 6) NOTIFICATIONS (source of truth)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System/admin can insert notifications" ON public.notifications;
CREATE POLICY "System/admin can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.blocks(blocked_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON public.reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_report_messages_report ON public.report_messages(report_id);
CREATE INDEX IF NOT EXISTS idx_moderations_user ON public.user_moderations(user_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.announcements(is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
