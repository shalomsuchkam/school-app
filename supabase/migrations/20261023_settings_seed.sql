-- Default settings for a fresh database (the self-hosted server starts empty instead of importing the cloud's
-- test data). Only app_* keys; existing values are never overwritten, so this is a no-op where they are set.
-- The operator details are public: they are printed in the terms and the privacy policy (legal.ts).
insert into public.app_secrets (key, value) values
  ('app_operator_ru', 'ИП «KonG Service», ИИН/БИН 021018500443, Республика Казахстан, г. Алматы'),
  ('app_operator_kk', '«KonG Service» ЖК, ЖСН/БСН 021018500443, Қазақстан Республикасы, Алматы қ.'),
  ('app_operator_en', 'Sole proprietor “KonG Service”, IIN/BIN 021018500443, Almaty, Republic of Kazakhstan'),
  ('app_support_email', 'urokikazakhstan@gmail.com'),
  -- owner-only POST /admin/grant (free access); read it on the server, never commit it
  ('app_admin_key', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;
