-- Fan out an admin announcement into one bell notification per targeted user.
-- Run after:
--   1. migration_security_admin_rls.sql
--   2. migration_block_report_moderation_announcements_notifications.sql
--
-- Bell rows are the source of truth. Push delivery is handled separately by the
-- send-announcement-push Edge Function and the announcements Database Webhook.

create or replace function public.fanout_announcement_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Do not fan out inactive announcements.
  if new.is_active is distinct from true then
    return new;
  end if;

  -- The current app only creates immediate announcements. An announcement
  -- whose end time is already in the past should not enter the bell.
  if new.ends_at is not null and new.ends_at < now() then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  select
    p.id,
    'announcement',
    new.title,
    new.body,
    jsonb_build_object(
      'screen', 'Notifications',
      'type', 'announcement',
      'announcementId', new.id
    )
  from public.profiles p
  where p.status = 'approved'
    and (
      (new.audience = 'all' and p.role in ('student', 'driver'))
      or (new.audience = 'students' and p.role = 'student')
      or (new.audience = 'drivers' and p.role = 'driver')
    );

  return new;
end;
$$;

drop trigger if exists trg_announcement_notifications on public.announcements;

create trigger trg_announcement_notifications
after insert on public.announcements
for each row
execute function public.fanout_announcement_notifications();
