BEGIN;

-- Add chat_id column to users table for Telegram bot integration
-- This column stores the Telegram chat ID for messaging
ALTER TABLE public.users ADD COLUMN chat_id bigint;

-- Add comment for documentation
COMMENT ON COLUMN public.users.chat_id IS 'Telegram chat ID for bot interactions';

COMMIT;
