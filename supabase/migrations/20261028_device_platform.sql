-- A child may use several devices (phone + tablet): each invite adds an app_devices row with the same child_id.
-- The parent's device list shows each one's platform: the app sends it when joining (POST /join, POST /family) and
-- with every call (x-platform header), so devices that joined earlier get it on their next start. Additive only.
alter table public.app_devices add column if not exists platform text;
alter table public.app_devices drop constraint if exists app_devices_platform_chk;
alter table public.app_devices add constraint app_devices_platform_chk check (platform is null or platform in ('android', 'ios', 'web'));
