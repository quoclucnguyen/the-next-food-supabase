# Expiring Food Notification System - Test Suite

This test suite demonstrates the complete expiring food notification system flow: **Database Trigger → Edge Function → Telegram Notification**.

## 🏗️ System Architecture

```
Food Item INSERT/UPDATE → Database Trigger → HTTP Call → Edge Function → Telegram Bot → User Chat
```

## 📁 Files Created

1. **`migrations/20250824102000_test_expiring_food_notifications.sql`** - Creates test data
2. **`migrations/20250824103000_rollback_test_expiring_food_notifications.sql`** - Cleans up test data
3. **`test-notification-system.sql`** - Interactive test script
4. **`README-test-notification-system.md`** - This documentation

## 🚀 Quick Start

### Prerequisites

1. **Main notification system must be deployed** - Run the migration: `20250824100926_create_expiring_food_notification_system.sql`
2. **Telegram bot configured** - Set up your bot and get the bot token
3. **Edge Function deployed** - Deploy the `telegram-send` function
4. **Environment variables** - Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_SEND_SECRET`

### Step 1: Run Test Migration

```bash
# Apply the test data migration
supabase db push

# Or if using Supabase CLI
supabase migration up
```

This creates:
- A test user with email `test-notifications@example.com`
- Test food items expiring soon (today and tomorrow)
- Automatic notification triggers

### Step 2: Update Telegram Chat ID

**IMPORTANT**: Edit the migration file and replace `123456789` with your actual Telegram chat ID:

```sql
-- In: migrations/20250824102000_test_expiring_food_notifications.sql
v_test_chat_id bigint := 123456789; -- Replace with your real chat ID
```

To find your chat ID:
1. Start a conversation with your bot
2. Send `/start` message
3. Check the bot logs or use a service like `@userinfobot`

### Step 3: Run the Test

Execute the test script:

```sql
-- Run this in your Supabase SQL editor or via CLI
\i supabase/test-notification-system.sql
```

This will:
- ✅ Verify the notification system is set up correctly
- 📊 Show current expiring items
- 🔄 Insert a new item to trigger a notification
- 📝 Provide verification instructions

### Step 4: Verify Results

Check these locations for confirmation:

1. **📱 Telegram Chat** - You should receive notification messages
2. **🔍 Supabase Edge Function Logs** - Check the `telegram-send` function logs
3. **📊 Database Logs** - Look for trigger execution logs
4. **🗄️ SQL Query** - Run verification queries from the test script

## 🧪 Expected Notifications

The test creates items that trigger different notification types:

| Item | Expiry | Notification Type |
|------|--------|-------------------|
| Test Urgent Yogurt | Today | 🚨 EXPIRES TODAY |
| Test Expiring Milk | Tomorrow | ⚠️ EXPIRES TOMORROW |
| Fresh Test Bread | In 2 days | 📅 EXPIRES SOON |

Example notification messages:

```
🚨 ALERT: Your 2 cups Test Urgent Yogurt (dairy) expires TODAY!
⚠️ WARNING: Your 1 liter Test Expiring Milk (dairy) expires TOMORROW!
📅 REMINDER: Your 1 loaf Fresh Test Bread (bakery) expires in 2 days.
```

## 🧹 Cleanup

After testing, run the rollback migration:

```bash
# Apply the rollback migration
supabase db push

# Or run the rollback file directly
\i supabase/migrations/20250824103000_rollback_test_expiring_food_notifications.sql
```

This removes all test data while preserving your real application data.

## 🔧 Troubleshooting

### No Notifications Received?

1. **Check Edge Function Logs**:
   - Go to Supabase Dashboard → Edge Functions → `telegram-send`
   - Look for errors in the function logs

2. **Verify Chat ID**:
   - Ensure the `chat_id` in the migration matches your Telegram chat
   - Test your bot token is valid

3. **Check Database Trigger**:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'trigger_expiring_food_notification';
   ```

4. **Test Edge Function Directly**:
   ```bash
   curl -X POST 'https://your-project.supabase.co/functions/v1/telegram-send' \
     -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
     -H 'Content-Type: application/json' \
     -d '{"chat_id": YOUR_CHAT_ID, "text": "Test message"}'
   ```

### Common Issues

- **"Unauthorized" error**: Check `TELEGRAM_SEND_SECRET` or service role authentication
- **"Invalid JSON"**: Verify request body format
- **Rate limited**: The function has built-in rate limiting (30 requests/minute)

## 📊 Verification Queries

Run these queries to verify the system:

```sql
-- Check test user and items
SELECT u.email, u.chat_id, fi.name, fi.expiration_date
FROM public.users u
LEFT JOIN public.food_items fi ON u.id = fi.user_id
WHERE u.email = 'test-notifications@example.com';

-- Check notification trigger
SELECT tgname, tgenabled
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE tgname = 'trigger_expiring_food_notification';

-- Check notification function
SELECT proname, prokind
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE proname = 'notify_expiring_food_item';
```

## 🎯 Production Considerations

Before using in production:

1. **Replace test chat ID** with real user chat IDs
2. **Set up proper error handling** for failed notifications
3. **Configure rate limiting** based on your user base
4. **Monitor Edge Function logs** for failed deliveries
5. **Implement retry logic** for failed HTTP calls
6. **Add user preferences** for notification frequency

## 📞 Support

If you encounter issues:

1. Check the Edge Function logs in Supabase Dashboard
2. Verify all environment variables are set correctly
3. Ensure your Telegram bot is configured and active
4. Test the Edge Function endpoint directly with curl

The test system is designed to be idempotent and safe to run multiple times. Always run the rollback migration between test runs to ensure clean state.