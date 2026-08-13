-- 0008_timezone_auto.sql
-- The client now treats profiles.timezone as "auto" | IANA time zone id.
-- Existing rows still carry the old 'UTC' default from 0001 and were never
-- written by the app (the preference was a static label), so they migrate to
-- "auto" — follow the device time zone until the user locks one.

alter table public.profiles alter column timezone set default 'auto';

update public.profiles set timezone = 'auto' where timezone = 'UTC';

comment on column public.profiles.timezone is
  'Timezone preference: "auto" follows the device time zone, otherwise an IANA time zone id.';
