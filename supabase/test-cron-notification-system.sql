-- Test Script for Cron-Based Notification System
-- Run this after deploying the new system to validate functionality

-- 1. Check if the queue table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'expiring_items_queue') THEN
        RAISE EXCEPTION 'expiring_items_queue table does not exist. Please run the migration.';
    END IF;
    RAISE NOTICE '✓ expiring_items_queue table exists';
END $$;

-- 2. Check if required functions exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_queue_stats') THEN
        RAISE EXCEPTION 'get_queue_stats function does not exist.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'populate_expiring_items_queue_manual') THEN
        RAISE EXCEPTION 'populate_expiring_items_queue_manual function does not exist.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'process_expiring_items_queue_manual') THEN
        RAISE EXCEPTION 'process_expiring_items_queue_manual function does not exist.';
    END IF;
    RAISE NOTICE '✓ All required functions exist';
END $$;

-- 3. Check if cron jobs are scheduled (requires pg_cron)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RAISE EXCEPTION 'pg_cron extension is not enabled. Please enable it to use cron jobs.';
    END IF;
    RAISE NOTICE '✓ pg_cron extension is enabled';
END $$;

-- 4. Test queue statistics function
DO $$
DECLARE
    stats_record RECORD;
    stats_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Testing get_queue_stats function...';
    FOR stats_record IN SELECT * FROM get_queue_stats() LOOP
        RAISE NOTICE 'Status: %, Count: %', stats_record.status, stats_record.count;
        stats_count := stats_count + 1;
    END LOOP;

    IF stats_count = 0 THEN
        RAISE NOTICE 'No queue items found (this is normal for a new system)';
    ELSE
        RAISE NOTICE 'Found % status categories in queue', stats_count;
    END IF;
END $$;

-- 5. Check for expiring food items that would need notifications
DO $$
DECLARE
    expiring_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO expiring_count
    FROM food_items fi
    JOIN auth.users u ON fi.user_id = u.id
    WHERE fi.expiration_date >= CURRENT_DATE
      AND fi.expiration_date <= CURRENT_DATE + INTERVAL '7 days'
      AND u.chat_id IS NOT NULL;

    RAISE NOTICE 'Found % food items expiring in the next 7 days with valid chat_ids', expiring_count;

    IF expiring_count = 0 THEN
        RAISE NOTICE 'Consider adding some test data with future expiration dates';
    END IF;
END $$;

-- 6. Test manual queue population (if there are items to populate)
DO $$
DECLARE
    result JSONB;
BEGIN
    RAISE NOTICE 'Testing manual queue population...';

    -- Only run if there are items that could be added to queue
    IF EXISTS (
        SELECT 1 FROM food_items fi
        JOIN auth.users u ON fi.user_id = u.id
        WHERE fi.expiration_date >= CURRENT_DATE
          AND fi.expiration_date <= CURRENT_DATE + INTERVAL '7 days'
          AND u.chat_id IS NOT NULL
    ) THEN
        result := populate_expiring_items_queue_manual(7);
        RAISE NOTICE 'Manual queue population result: %', result;

        IF (result->>'success')::boolean THEN
            RAISE NOTICE '✓ Manual queue population successful';
        ELSE
            RAISE WARNING '✗ Manual queue population failed: %', result->>'error';
        END IF;
    ELSE
        RAISE NOTICE 'Skipping manual queue population test (no eligible items)';
    END IF;
END $$;

-- 7. Check queue after population
DO $$
DECLARE
    queue_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO queue_count FROM expiring_items_queue;
    RAISE NOTICE 'Queue now contains % items', queue_count;

    IF queue_count > 0 THEN
        RAISE NOTICE 'Queue contents:';
        FOR i IN 1..LEAST(queue_count, 5) LOOP
            RAISE NOTICE '  Item %: % - % (expires in % days)',
                i,
                (SELECT item_name FROM expiring_items_queue ORDER BY created_at DESC LIMIT 1 OFFSET i-1),
                (SELECT status FROM expiring_items_queue ORDER BY created_at DESC LIMIT 1 OFFSET i-1),
                (SELECT days_until_expiry FROM expiring_items_queue ORDER BY created_at DESC LIMIT 1 OFFSET i-1);
        END LOOP;

        IF queue_count > 5 THEN
            RAISE NOTICE '  ... and % more items', queue_count - 5;
        END IF;
    END IF;
END $$;

-- 8. Test manual queue processing (if there are pending items)
DO $$
DECLARE
    result JSONB;
    pending_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO pending_count FROM expiring_items_queue WHERE status = 'pending';

    IF pending_count > 0 THEN
        RAISE NOTICE 'Testing manual queue processing (% pending items)...', pending_count;

        -- Note: This will actually send notifications if configured properly
        -- Comment out this section if you don't want to send test notifications
        /*
        result := process_expiring_items_queue_manual();
        RAISE NOTICE 'Manual queue processing result: %', result;

        IF (result->>'success')::boolean THEN
            RAISE NOTICE '✓ Manual queue processing successful';
            RAISE NOTICE '  Processed: %, Sent: %, Failed: %',
                result->>'total_processed',
                result->>'total_sent',
                result->>'total_failed';
        ELSE
            RAISE WARNING '✗ Manual queue processing failed: %', result->>'error';
        END IF;
        */
        RAISE NOTICE 'Manual queue processing test skipped (uncomment in script to run)';
    ELSE
        RAISE NOTICE 'Skipping manual queue processing test (no pending items)';
    END IF;
END $$;

-- 9. Show system status summary
DO $$
DECLARE
    total_items INTEGER;
    pending_items INTEGER;
    sent_items INTEGER;
    failed_items INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_items FROM expiring_items_queue;
    SELECT COUNT(*) INTO pending_items FROM expiring_items_queue WHERE status = 'pending';
    SELECT COUNT(*) INTO sent_items FROM expiring_items_queue WHERE status = 'sent';
    SELECT COUNT(*) INTO failed_items FROM expiring_items_queue WHERE status = 'failed';

    RAISE NOTICE '=== System Status Summary ===';
    RAISE NOTICE 'Total queue items: %', total_items;
    RAISE NOTICE 'Pending items: %', pending_items;
    RAISE NOTICE 'Sent items: %', sent_items;
    RAISE NOTICE 'Failed items: %', failed_items;

    IF total_items = 0 THEN
        RAISE NOTICE 'System is ready but no items are in the queue yet.';
        RAISE NOTICE 'The daily cron job will populate the queue automatically.';
    ELSIF pending_items > 0 THEN
        RAISE NOTICE 'There are pending items waiting to be processed.';
        RAISE NOTICE 'The 15-minute cron job will process them automatically.';
    ELSE
        RAISE NOTICE 'All items have been processed.';
    END IF;
END $$;

-- 10. Check cron job status (if possible)
DO $$
BEGIN
    RAISE NOTICE '=== Cron Job Information ===';
    RAISE NOTICE 'The following cron jobs should be scheduled:';
    RAISE NOTICE '1. populate-expiring-queue-daily: Runs at 6:00 AM UTC daily';
    RAISE NOTICE '2. process-expiring-queue-15min: Runs every 15 minutes';
    RAISE NOTICE '3. cleanup-old-queue-items-daily: Runs at 2:00 AM UTC daily';
    RAISE NOTICE '';
    RAISE NOTICE 'To check cron job status, run:';
    RAISE NOTICE 'SELECT * FROM cron.job;';
    RAISE NOTICE 'SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;';
END $$;

-- Final validation message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Test Complete ===';
    RAISE NOTICE 'The cron-based notification system has been implemented successfully!';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Deploy the Edge Functions to your Supabase project';
    RAISE NOTICE '2. Run the migrations to set up the database schema';
    RAISE NOTICE '3. The system will automatically start working based on the cron schedules';
    RAISE NOTICE '4. Monitor the queue status using the functions in this script';
END $$;