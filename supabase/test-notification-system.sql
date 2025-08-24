-- Test Script for Expiring Food Notification System
-- This script demonstrates the complete notification flow:
-- Database Trigger → Edge Function → Telegram Notification
--
-- Prerequisites:
-- 1. Run the main notification system migration first
-- 2. Run the test data migration: 20250824102000_test_expiring_food_notifications.sql
-- 3. Replace the chat_id in the migration with your actual Telegram chat ID
-- 4. Ensure your Telegram bot is configured and the telegram-send Edge Function is deployed

-- === STEP 1: Verify the notification system is set up ===
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== STEP 1: SYSTEM VERIFICATION ===';
  RAISE NOTICE '';

  -- Check if the trigger exists
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'trigger_expiring_food_notification'
      AND n.nspname = 'public'
      AND c.relname = 'food_items'
  ) THEN
    RAISE NOTICE '✅ Notification trigger is active on food_items table';
  ELSE
    RAISE NOTICE '❌ Notification trigger is missing - run the main notification migration first';
  END IF;

  -- Check if the function exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'notify_expiring_food_item'
      AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE '✅ Notification function notify_expiring_food_item exists';
  ELSE
    RAISE NOTICE '❌ Notification function is missing - run the main notification migration first';
  END IF;

  -- Check if test data exists
  IF EXISTS (
    SELECT 1 FROM public.users WHERE email = 'test-notifications@example.com'
  ) THEN
    RAISE NOTICE '✅ Test user exists';
  ELSE
    RAISE NOTICE '❌ Test user missing - run the test migration first';
  END IF;
END
$$;

-- === STEP 2: Show current expiring items ===
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== STEP 2: CURRENT EXPIRING ITEMS ===';
  RAISE NOTICE '';
END
$$;

SELECT
  fi.name as item_name,
  fi.quantity,
  fi.unit,
  fi.expiration_date,
  (fi.expiration_date - CURRENT_DATE) as days_until_expiry,
  CASE
    WHEN fi.expiration_date = CURRENT_DATE THEN 'EXPIRES TODAY 🚨'
    WHEN fi.expiration_date = CURRENT_DATE + INTERVAL '1 day' THEN 'EXPIRES TOMORROW ⚠️'
    ELSE 'EXPIRES SOON 📅'
  END as urgency,
  u.email as user_email,
  u.chat_id as telegram_chat_id
FROM public.food_items fi
JOIN public.users u ON fi.user_id = u.id
WHERE fi.expiration_date >= CURRENT_DATE
  AND fi.expiration_date <= CURRENT_DATE + INTERVAL '7 days'
  AND u.email = 'test-notifications@example.com'
ORDER BY fi.expiration_date;

-- === STEP 3: Manually trigger a notification by inserting a new expiring item ===
DO $$
DECLARE
  v_test_user_id uuid := '550e8400-e29b-41d4-a716-446655440000';
  v_new_item_id bigint;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== STEP 3: TRIGGERING NEW NOTIFICATION ===';
  RAISE NOTICE '';

  -- Insert a new item that expires in 2 days
  INSERT INTO public.food_items (
    user_id,
    name,
    quantity,
    unit,
    expiration_date,
    category,
    created_at,
    updated_at
  ) VALUES (
    v_test_user_id,
    'Fresh Test Bread',
    1,
    'loaf',
    CURRENT_DATE + INTERVAL '2 days',
    'bakery',
    now(),
    now()
  )
  RETURNING id INTO v_new_item_id;

  RAISE NOTICE '✅ Inserted new test item "Fresh Test Bread" (ID: %) expiring in 2 days', v_new_item_id;
  RAISE NOTICE '📱 This should automatically trigger a Telegram notification!';
  RAISE NOTICE '📊 Check the Supabase Edge Function logs to verify the notification was sent';
END
$$;

-- === STEP 4: Wait and verify ===
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== STEP 4: VERIFICATION INSTRUCTIONS ===';
  RAISE NOTICE '';
  RAISE NOTICE 'To verify the notification system worked:';
  RAISE NOTICE '';
  RAISE NOTICE '1. 📱 Check your Telegram chat for the notification message';
  RAISE NOTICE '2. 🔍 Check Supabase Edge Function logs in the dashboard';
  RAISE NOTICE '3. 📊 Check database logs for trigger execution';
  RAISE NOTICE '4. 🧪 Run this query to see all test notifications:';
  RAISE NOTICE '';
  RAISE NOTICE '   SELECT fi.name, fi.expiration_date, u.chat_id';
  RAISE NOTICE '   FROM public.food_items fi';
  RAISE NOTICE '   JOIN public.users u ON fi.user_id = u.id';
  RAISE NOTICE '   WHERE u.email = ''test-notifications@example.com''';
  RAISE NOTICE '   ORDER BY fi.created_at DESC LIMIT 5;';
  RAISE NOTICE '';
  RAISE NOTICE '5. 🧹 After testing, run the rollback migration to clean up:';
  RAISE NOTICE '   20250824103000_rollback_test_expiring_food_notifications.sql';
END
$$;

-- === STEP 5: Show final state ===
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== STEP 5: FINAL TEST STATE ===';
  RAISE NOTICE '';
END
$$;

-- Show final state of test data
SELECT
  'Test Items Created' as status,
  COUNT(*) as count
FROM public.food_items fi
JOIN public.users u ON fi.user_id = u.id
WHERE u.email = 'test-notifications@example.com'

UNION ALL

SELECT
  'Items Expiring Soon (<=7 days)' as status,
  COUNT(*) as count
FROM public.food_items fi
JOIN public.users u ON fi.user_id = u.id
WHERE u.email = 'test-notifications@example.com'
  AND fi.expiration_date >= CURRENT_DATE
  AND fi.expiration_date <= CURRENT_DATE + INTERVAL '7 days'

UNION ALL

SELECT
  'Items Expiring Today' as status,
  COUNT(*) as count
FROM public.food_items fi
JOIN public.users u ON fi.user_id = u.id
WHERE u.email = 'test-notifications@example.com'
  AND fi.expiration_date = CURRENT_DATE

UNION ALL

SELECT
  'Items Expiring Tomorrow' as status,
  COUNT(*) as count
FROM public.food_items fi
JOIN public.users u ON fi.user_id = u.id
WHERE u.email = 'test-notifications@example.com'
  AND fi.expiration_date = CURRENT_DATE + INTERVAL '1 day';