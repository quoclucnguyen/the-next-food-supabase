-- Rollback migration for expiring food notification test
-- This removes all test data created by the test migration
-- Run this to clean up after testing

BEGIN;

-- Remove test food items
DELETE FROM public.food_items
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000'
  AND (name = 'Test Expiring Milk' OR name = 'Test Urgent Yogurt');

-- Remove test user profile
DELETE FROM public.users
WHERE id = '550e8400-e29b-41d4-a716-446655440000';

-- Remove test user identities
DELETE FROM auth.identities
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000';

-- Remove test user from auth.users
DELETE FROM auth.users
WHERE id = '550e8400-e29b-41d4-a716-446655440000';

-- Display cleanup results
DO $$
DECLARE
  v_deleted_food_count integer;
  v_deleted_users_count integer;
BEGIN
  -- Count deleted food items (this will be 0 since we already deleted them)
  SELECT COUNT(*) INTO v_deleted_food_count
  FROM public.food_items
  WHERE user_id = '550e8400-e29b-41d4-a716-446655440000';

  -- Count remaining test users (this should be 0)
  SELECT COUNT(*) INTO v_deleted_users_count
  FROM auth.users
  WHERE id = '550e8400-e29b-41d4-a716-446655440000';

  RAISE NOTICE '=== TEST DATA CLEANUP COMPLETED ===';
  RAISE NOTICE 'Test food items remaining: %', v_deleted_food_count;
  RAISE NOTICE 'Test users remaining: %', v_deleted_users_count;
  RAISE NOTICE 'All test data has been successfully removed.';
  RAISE NOTICE '';
  RAISE NOTICE 'To run the test again, execute the migration:';
  RAISE NOTICE '  supabase db push (or apply the test migration again)';
END
$$;

COMMIT;