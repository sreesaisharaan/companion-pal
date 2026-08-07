-- 0005_reminders_device_id.sql
-- The app schedules device-local notifications for due tasks and records intent
-- in public.reminders. This column links a row to the expo-notifications id so
-- the scheduled notification can be cancelled when the task is completed.

alter table public.reminders
  add column device_notification_id text;

comment on column public.reminders.device_notification_id
  is 'expo-notifications identifier for the scheduled local notification, if any.';
