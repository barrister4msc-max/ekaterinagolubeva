ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS legal_form text,
  ADD COLUMN IF NOT EXISTS legal_full_name text,
  ADD COLUMN IF NOT EXISTS legal_inn text,
  ADD COLUMN IF NOT EXISTS legal_ogrnip text,
  ADD COLUMN IF NOT EXISTS legal_address text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_telegram_url text,
  ADD COLUMN IF NOT EXISTS contact_whatsapp_url text,
  ADD COLUMN IF NOT EXISTS contact_max_url text,
  ADD COLUMN IF NOT EXISTS site_domain text,
  ADD COLUMN IF NOT EXISTS advisor_photo_url text;

UPDATE public.site_settings
SET legal_form = COALESCE(legal_form, 'Самозанятый'),
    legal_full_name = COALESCE(legal_full_name, 'Голубева Екатерина Александровна')
WHERE id = 1;