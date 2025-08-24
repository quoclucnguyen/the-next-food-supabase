BEGIN;

-- Remove existing trigger-based notification system
DROP TRIGGER IF EXISTS trigger_expiring_food_notification ON public.food_items;
DROP FUNCTION IF EXISTS notify_expiring_food_item();

-- Add helpful comments about the new system
COMMENT ON TABLE public.expiring_items_queue IS 'Queue for staging expiring food items that need notifications - replaces trigger-based system';

-- Create a function to manually trigger queue population (for testing/admin purposes)
CREATE OR REPLACE FUNCTION public.populate_expiring_items_queue_manual(days_ahead INTEGER DEFAULT 7)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    edge_function_url TEXT;
    request_body JSONB;
    response_status INTEGER;
    response_body TEXT;
BEGIN
    -- Construct Edge Function URL
    edge_function_url := format(
        '%s/functions/v1/populate-expiring-queue',
        current_setting('app.supabase_url', true)
    );

    -- Prepare request body
    request_body := jsonb_build_object('days_ahead', days_ahead);

    -- Make HTTP request to Edge Function
    SELECT status, content INTO response_status, response_body
    FROM net.http_post(
        url := edge_function_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', format('Bearer %s', current_setting('app.service_role_key', true))
        ),
        body := request_body
    );

    -- Return response
    RETURN jsonb_build_object(
        'status', response_status,
        'body', response_body::jsonb,
        'success', (response_status >= 200 AND response_status < 300)
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'status', 500
        );
END;
$$;

-- Create a function to manually trigger queue processing (for testing/admin purposes)
CREATE OR REPLACE FUNCTION public.process_expiring_items_queue_manual()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    edge_function_url TEXT;
    response_status INTEGER;
    response_body TEXT;
BEGIN
    -- Construct Edge Function URL
    edge_function_url := format(
        '%s/functions/v1/process-expiring-queue',
        current_setting('app.supabase_url', true)
    );

    -- Make HTTP request to Edge Function
    SELECT status, content INTO response_status, response_body
    FROM net.http_post(
        url := edge_function_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', format('Bearer %s', current_setting('app.service_role_key', true))
        ),
        body := '{}'::jsonb
    );

    -- Return response
    RETURN jsonb_build_object(
        'status', response_status,
        'body', response_body::jsonb,
        'success', (response_status >= 200 AND response_status < 300)
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'status', 500
        );
END;
$$;

-- Grant necessary permissions for the manual functions
GRANT EXECUTE ON FUNCTION public.populate_expiring_items_queue_manual(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_expiring_items_queue_manual() TO service_role;

-- Add helpful comments
COMMENT ON FUNCTION public.populate_expiring_items_queue_manual(INTEGER) IS 'Manually trigger the queue population process for testing or admin purposes';
COMMENT ON FUNCTION public.process_expiring_items_queue_manual() IS 'Manually trigger the queue processing for testing or admin purposes';

COMMIT;