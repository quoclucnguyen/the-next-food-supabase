BEGIN;

-- Enable pg_net extension for HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Function to send notification for expiring food items
CREATE OR REPLACE FUNCTION notify_expiring_food_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_chat_id bigint;
  days_until_expiry integer;
  message_text text;
  edge_function_url text;
  request_body jsonb;
  request_id bigint;
BEGIN
  -- Only proceed if the item is expiring within 7 days and has a future expiration date
  IF NEW.expiration_date >= CURRENT_DATE AND NEW.expiration_date <= CURRENT_DATE + INTERVAL '7 days' THEN

    -- Get the user's chat_id
    SELECT u.chat_id INTO user_chat_id
    FROM auth.users u
    WHERE u.id = NEW.user_id;

    -- Only send notification if user has a chat_id configured
    IF user_chat_id IS NOT NULL THEN
      -- Calculate days until expiry
      days_until_expiry := NEW.expiration_date - CURRENT_DATE;

      -- Create notification message
      IF days_until_expiry = 0 THEN
        message_text := format(
          '🚨 ALERT: Your %s %s (%s) expires TODAY!',
          NEW.quantity,
          NEW.name,
          NEW.unit
        );
      ELSIF days_until_expiry = 1 THEN
        message_text := format(
          '⚠️ WARNING: Your %s %s (%s) expires TOMORROW!',
          NEW.quantity,
          NEW.name,
          NEW.unit
        );
      ELSE
        message_text := format(
          '📅 REMINDER: Your %s %s (%s) expires in %s days.',
          NEW.quantity,
          NEW.name,
          NEW.unit,
          days_until_expiry
        );
      END IF;

      -- Add category and any additional info
      message_text := message_text || format('\n📂 Category: %s', NEW.category);

      -- Construct Edge Function URL
      edge_function_url := format(
        '%s/functions/v1/telegram-send',
        current_setting('app.supabase_url', true)
      );

      -- Prepare request body
      request_body := jsonb_build_object(
        'chat_id', user_chat_id,
        'text', message_text,
        'parse_mode', 'HTML'
      );

      -- Make async HTTP request to Edge Function
      SELECT net.http_post(
        url := edge_function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', format('Bearer %s', current_setting('app.service_role_key', true))
        ),
        body := request_body
      ) INTO request_id;

      -- Log the notification attempt (for debugging)
      RAISE LOG 'Sent expiring food notification for item % to user % (request_id: %)',
        NEW.id, NEW.user_id, request_id;

    END IF;
  END IF;

  -- Return the new row (required for triggers)
  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the transaction
    RAISE LOG 'Error in notify_expiring_food_item trigger: % (item_id: %)',
      SQLERRM, NEW.id;
    RETURN NEW;
END;
$$;

-- Create trigger that fires after INSERT or UPDATE on food_items
CREATE OR REPLACE TRIGGER trigger_expiring_food_notification
  AFTER INSERT OR UPDATE ON public.food_items
  FOR EACH ROW
  EXECUTE FUNCTION notify_expiring_food_item();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION notify_expiring_food_item() TO anon;
GRANT EXECUTE ON FUNCTION notify_expiring_food_item() TO authenticated;
GRANT EXECUTE ON FUNCTION notify_expiring_food_item() TO service_role;

-- Add helpful comments
COMMENT ON FUNCTION notify_expiring_food_item() IS 'Sends Telegram notifications for food items expiring within 7 days using pg_net';
COMMENT ON TRIGGER trigger_expiring_food_notification ON public.food_items IS 'Automatically triggers notifications for expiring food items';

COMMIT;