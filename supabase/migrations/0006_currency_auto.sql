-- 0006_currency_auto.sql
-- The client now treats preferred_currency as "auto" | ISO 4217 code. New
-- users follow the device currency until they lock one; existing 'USD' rows
-- keep reading as a locked USD preference (matching what they saw before).

alter table public.profiles alter column preferred_currency set default 'auto';

comment on column public.profiles.preferred_currency is
  'Currency preference: "auto" follows the device currency, otherwise an ISO 4217 code.';
