BEGIN;

-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres user
GRANT USAGE ON SCHEMA cron TO postgres;


-- Schedule daily queue population at 6 AM UTC (11 AM Bangkok time)
-- This runs every day at 6:00 AM UTC
SELECT cron.schedule(
    'populate-expiring-queue-daily',  -- job name
    '0 6 * * *',                     -- 6 AM daily
    $$
    SELECT
        net.http_post(
            url := format('%s/functions/v1/populate-expiring-queue', current_setting('app.supabase_url')),
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', format('Bearer %s', current_setting('app.service_role_key'))
            ),
            body := jsonb_build_object()
        ) as request_id;
    $$
);

-- Schedule queue processing every 15 minutes
-- This ensures notifications are sent regularly throughout the day
SELECT cron.schedule(
    'process-expiring-queue-15min',  -- job name
    '*/15 * * * *',                  -- every 15 minutes
    $$
    SELECT
        net.http_post(
            url := format('%s/functions/v1/process-expiring-queue', current_setting('app.supabase_url')),
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', format('Bearer %s', current_setting('app.service_role_key'))
            ),
            body := jsonb_build_object()
        ) as request_id;
    $$
);

-- Schedule cleanup of old queue items daily at 2 AM UTC
SELECT cron.schedule(
    'cleanup-old-queue-items-daily', -- job name
    '0 2 * * *',                     -- 2 AM daily
    $$
    DELETE FROM public.expiring_items_queue
    WHERE created_at < NOW() - INTERVAL '30 days'
       OR (status IN ('sent', 'failed') AND processed_at < NOW() - INTERVAL '7 days');
    $$
);

-- Cron jobs are now scheduled and ready to run
-- Check Supabase Dashboard > Database > Cron for scheduled jobs
-- Monitor Edge Function logs for execution details

COMMIT;