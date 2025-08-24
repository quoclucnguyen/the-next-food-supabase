-- Test migration for expiring food notification system
-- This migration creates test data to demonstrate the notification system
-- Run this after the notification system migration is applied

BEGIN;

-- Create a test user specifically for notification testing
DO $$
DECLARE
  v_test_user_id uuid := '550e8400-e29b-41d4-a716-446655440000';
  v_test_email text := 'test-notifications@example.com';
  v_test_chat_id bigint := 123456789; -- Test chat ID (replace with real one for actual testing)
BEGIN

  -- Insert test user into auth.users if not exists
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
    v_test_user_id,
    v_test_email,
    crypt('test-password', gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
    '{}'::jsonb,
    'authenticated',
    'authenticated',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert email identity for test user
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
    v_test_user_id,
    'email',
    v_test_user_id,
    jsonb_build_object('sub', v_test_user_id::text, 'email', v_test_email),
    now(),
    now()
  )
  ON CONFLICT (provider, provider_id) DO NOTHING;

  -- Insert test user profile with Telegram chat_id
  INSERT INTO public.users (
    id,
    email,
    first_name,
    last_name,
    username,
    last_login,
    created_at,
    updated_at,
    chat_id
  )
  VALUES (
    v_test_user_id,
    v_test_email,
    'Test',
    'Notification',
    'testnotify',
    now(),
    now(),
    now(),
    v_test_chat_id
  )
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Test user created with ID: %, Email: %, Chat ID: %', v_test_user_id, v_test_email, v_test_chat_id;
END
$$;

-- Insert a food item that expires tomorrow (should trigger notification)
DO $$
DECLARE
  v_test_user_id uuid := '550e8400-e29b-41d4-a716-446655440000';
  v_expiry_date date := CURRENT_DATE + INTERVAL '1 day';
BEGIN

  -- Insert test food item that expires tomorrow
  INSERT INTO public.food_items (
    user_id,
    name,
    quantity,
    unit,
    expiration_date,
    category,
    image_url,
    created_at,
    updated_at
  ) VALUES (
    v_test_user_id,
    'Test Expiring Milk',
    1,
    'liter',
    v_expiry_date,
    'dairy',
    NULL,
    now(),
    now()
  );

  RAISE NOTICE 'Test food item "Test Expiring Milk" created, expires on: %', v_expiry_date;
  RAISE NOTICE 'This should trigger a notification to chat_id: 123456789';
END
$$;

-- Insert another food item that expires today (urgent notification)
DO $$
DECLARE
  v_test_user_id uuid := '550e8400-e29b-41d4-a716-446655440000';
  v_expiry_date date := CURRENT_DATE;
BEGIN

  -- Insert test food item that expires today (should trigger urgent notification)
  INSERT INTO public.food_items (
    user_id,
    name,
    quantity,
    unit,
    expiration_date,
    category,
    image_url,
    created_at,
    updated_at
  ) VALUES (
    v_test_user_id,
    'Test Urgent Yogurt',
    2,
    'cups',
    v_expiry_date,
    'dairy',
    NULL,
    now(),
    now()
  );

  RAISE NOTICE 'Test food item "Test Urgent Yogurt" created, expires TODAY: %', v_expiry_date;
  RAISE NOTICE 'This should trigger an URGENT notification to chat_id: 123456789';
END
$$;

-- Test data verification (check these manually after migration)
-- 1. Test user: SELECT id, email, first_name, last_name, chat_id FROM public.users WHERE email = 'test-notifications@example.com';
-- 2. Test food items: SELECT fi.name, fi.quantity, fi.unit, fi.expiration_date, fi.category FROM public.food_items fi JOIN public.users u ON fi.user_id = u.id WHERE u.email = 'test-notifications@example.com';
-- 3. Check notifications: Look in Supabase Dashboard > Edge Functions > telegram-send logs
-- 4. Manual test: INSERT INTO public.food_items (user_id, name, quantity, unit, expiration_date, category) VALUES ('550e8400-e29b-41d4-a716-446655440000', 'Manual Test', 1, 'pieces', CURRENT_DATE + INTERVAL '2 days', 'test');

-- Display the actual test data
SELECT
  'Test User' as type,
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.chat_id,
  NULL as food_name,
  NULL as expiration_date,
  NULL as days_until_expiry
FROM public.users u
WHERE u.email = 'test-notifications@example.com'

UNION ALL

SELECT
  'Food Item' as type,
  fi.user_id as id,
  u.email,
  NULL as first_name,
  NULL as last_name,
  u.chat_id,
  fi.name as food_name,
  fi.expiration_date,
  (fi.expiration_date - CURRENT_DATE) as days_until_expiry
FROM public.food_items fi
JOIN public.users u ON fi.user_id = u.id
WHERE u.email = 'test-notifications@example.com'
ORDER BY type, expiration_date;

COMMIT;