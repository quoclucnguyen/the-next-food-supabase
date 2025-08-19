-- supabase/seed.sql
-- Seed defaults and ensure idempotency for local/dev environments
-- - Creates a demo auth user (if missing)
-- - Ensures an email identity with required provider_id
-- - Ensures trigger to seed defaults on new users
-- - Backfills default categories/units and user_settings for all users

BEGIN;

-- Ensure required extension for gen_random_uuid(), crypt(), gen_salt()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- === 1) Create a demo auth user if not present ===
DO $$
DECLARE
  v_user_id uuid;
  v_email text := 'demo@example.com';
  v_password text := 'demo-password';
BEGIN
  -- Find existing user by email (ignoring soft-deleted)
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email AND deleted_at IS NULL
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
      '{}'::jsonb,
      'authenticated',
      'authenticated',
      now(),
      now()
    );
  END IF;

  -- === 2) Ensure an email identity exists for the user (idempotent) ===
  -- NOTE: For email/phone identities, provider_id must equal auth.users.id
  -- (composite uniqueness on (provider, provider_id))
  INSERT INTO auth.identities (
    id,
    user_id,
    provider,
    provider_id,
    identity_data,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_user_id,
    'email',
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    now(),
    now()
  )
  ON CONFLICT (provider, provider_id) DO NOTHING;

  -- === 3) Seed sample food items for the demo user (idempotent) ===
  INSERT INTO public.food_items
    (user_id, name, quantity, unit, expiration_date, category, image_url)
  SELECT v.user_id, v.name, v.quantity, v.unit, v.expiration_date, v.category, v.image_url
  FROM (
    VALUES
      (v_user_id, 'Milk',            1,   'liters',   (current_date + interval '5 days')::date,   'dairy',      NULL),
      (v_user_id, 'Apples',          6,   'pieces',   (current_date + interval '10 days')::date,  'fruits',     NULL),
      (v_user_id, 'Chicken Breast',  2,   'lbs',      (current_date + interval '3 days')::date,   'meat',       NULL),
      (v_user_id, 'Rice',            2,   'kg',       (current_date + interval '365 days')::date, 'grains',     NULL),
      (v_user_id, 'Spinach',         300, 'g',        (current_date + interval '2 days')::date,   'vegetables', NULL),
      (v_user_id, 'Yogurt',          4,   'cups',     (current_date + interval '12 days')::date,  'dairy',      NULL),
      (v_user_id, 'Olive Oil',       1,   'bottles',  (current_date + interval '720 days')::date, 'pantry',     NULL),
      (v_user_id, 'Soda',            6,   'cans',     (current_date + interval '180 days')::date, 'beverages',  NULL),
      (v_user_id, 'Ice Cream',       2,   'packages', (current_date + interval '90 days')::date,  'frozen',     NULL),
      (v_user_id, 'Chips',           3,   'packages', (current_date + interval '120 days')::date, 'snacks',     NULL)
  ) AS v(user_id, name, quantity, unit, expiration_date, category, image_url)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.food_items f
    WHERE f.user_id = v.user_id
      AND f.name = v.name
      AND f.expiration_date = v.expiration_date
  );
END
$$;

-- === 3) Create trigger to seed default categories/units on new user insert ===
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'seed_defaults_after_user_signup'
      AND n.nspname = 'auth'
      AND c.relname = 'users'
  ) THEN
    CREATE TRIGGER seed_defaults_after_user_signup
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.seed_default_categories_units();
  END IF;
END
$$;

-- === 4) Backfill default categories for all users (no duplicates because of ON CONFLICT) ===
WITH default_categories(name, display_name) AS (
  VALUES
    ('fruits', 'Fruits'),
    ('vegetables', 'Vegetables'),
    ('dairy', 'Dairy'),
    ('meat', 'Meat'),
    ('grains', 'Grains'),
    ('pantry', 'Pantry'),
    ('frozen', 'Frozen'),
    ('beverages', 'Beverages'),
    ('snacks', 'Snacks'),
    ('other', 'Other')
)
INSERT INTO public.categories (user_id, name, display_name)
SELECT u.id, dc.name, dc.display_name
FROM auth.users u
CROSS JOIN default_categories dc
ON CONFLICT (user_id, name) DO NOTHING;

-- === 5) Backfill default units for all users (no duplicates because of ON CONFLICT) ===
WITH default_units(name, display_name) AS (
  VALUES
    ('pieces', 'Pieces'),
    ('lbs', 'Lbs'),
    ('oz', 'Oz'),
    ('kg', 'Kg'),
    ('g', 'G'),
    ('cups', 'Cups'),
    ('liters', 'Liters'),
    ('ml', 'Ml'),
    ('cans', 'Cans'),
    ('bottles', 'Bottles'),
    ('packages', 'Packages')
)
INSERT INTO public.units (user_id, name, display_name)
SELECT u.id, du.name, du.display_name
FROM auth.users u
CROSS JOIN default_units du
ON CONFLICT (user_id, name) DO NOTHING;

-- === 6) Ensure a user_settings row exists for every user ===
INSERT INTO public.user_settings (user_id, preferences, gemini_api_key)
SELECT u.id, '{}'::jsonb, NULL
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
