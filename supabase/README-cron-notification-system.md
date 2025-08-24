# Cron-Based Notification System

This document describes the new cron-based notification system that replaces the previous trigger-based approach for sending expiring food item notifications.

## Overview

The new system uses a queue-based architecture that's more scalable and efficient:

1. **Daily Queue Population**: A cron job runs daily to find items expiring in the next 7 days and populate a notification queue
2. **Queue Processing**: Another cron job processes the queue every 15 minutes to send notifications
3. **Priority-Based Processing**: Notifications are prioritized by urgency (urgent → high → medium → low)

## Architecture

### Components

- **`expiring_items_queue` table**: Stores items that need notifications
- **`populate-expiring-queue` Edge Function**: Populates the queue daily
- **`process-expiring-queue` Edge Function**: Processes the queue and sends notifications
- **Cron Jobs**: Automated scheduling using `pg_cron`

### Database Schema

```sql
CREATE TABLE public.expiring_items_queue (
    id UUID PRIMARY KEY,
    food_item_id UUID REFERENCES food_items(id),
    user_id UUID,
    chat_id BIGINT, -- Telegram chat ID
    item_name TEXT,
    quantity NUMERIC,
    unit TEXT,
    expiration_date DATE,
    category TEXT,
    days_until_expiry INTEGER,
    notification_priority TEXT, -- 'urgent', 'high', 'medium', 'low'
    scheduled_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    status TEXT, -- 'pending', 'processing', 'sent', 'failed'
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
);
```

## Cron Jobs

### 1. Daily Queue Population
- **Schedule**: Every day at 6:00 AM UTC (11:00 AM Bangkok time)
- **Function**: `populate-expiring-queue`
- **Purpose**: Find items expiring in 0-7 days and add to queue

### 2. Queue Processing
- **Schedule**: Every 15 minutes
- **Function**: `process-expiring-queue`
- **Purpose**: Send notifications from the queue

### 3. Queue Cleanup
- **Schedule**: Every day at 2:00 AM UTC
- **Purpose**: Remove old processed items (older than 30 days)

## Edge Functions

### `populate-expiring-queue`

**Endpoint**: `POST /functions/v1/populate-expiring-queue`

Populates the notification queue with items expiring in the next 7 days.

**Features**:
- Processes items in batches of 100 for performance
- Sets notification priority based on days until expiry
- Handles duplicate prevention
- Comprehensive error handling

### `process-expiring-queue`

**Endpoint**: `POST /functions/v1/process-expiring-queue`

Processes the notification queue and sends Telegram messages.

**Features**:
- Processes items in batches of 50
- Rate limiting (100ms between notifications)
- Priority-based processing (urgent first)
- Status tracking and error handling
- Retry logic for failed notifications

### Updated `expiring-items`

**Endpoint**: `GET /functions/v1/expiring-items`

Enhanced to support both legacy and queue-based queries.

**New Parameters**:
- `endpoint=queue`: Query the notification queue
- `status=pending|processing|sent|failed`: Filter by status
- `limit=100`: Limit results (max 1000)

**Legacy Support**:
- `endpoint=items` (default): Original food_items query
- `days=7`: Days ahead parameter (legacy)

## API Usage

### Manual Queue Population
```sql
SELECT public.populate_expiring_items_queue_manual(7); -- Populate for 7 days ahead
```

### Manual Queue Processing
```sql
SELECT public.process_expiring_items_queue_manual(); -- Process pending notifications
```

### Check Queue Status
```sql
-- Get queue statistics
SELECT * FROM public.get_queue_stats();

-- View pending items
SELECT * FROM public.expiring_items_queue
WHERE status = 'pending'
ORDER BY notification_priority DESC, scheduled_at ASC;
```

## Migration from Trigger-Based System

The migration automatically:
1. Removes the old trigger: `trigger_expiring_food_notification`
2. Removes the old function: `notify_expiring_food_item()`
3. Sets up the new queue-based system
4. Creates cron jobs for automation

## Benefits of Queue-Based System

1. **Scalability**: Can handle bulk notifications efficiently
2. **Reliability**: Failed notifications can be retried
3. **Monitoring**: Track notification status and success rates
4. **Flexibility**: Easy to modify notification logic
5. **Performance**: Reduces database load from triggers
6. **Analytics**: Better insights into notification patterns

## Monitoring and Debugging

### Queue Statistics
```sql
SELECT status, COUNT(*) as count
FROM public.expiring_items_queue
GROUP BY status;
```

### Failed Notifications
```sql
SELECT * FROM public.expiring_items_queue
WHERE status = 'failed'
ORDER BY updated_at DESC;
```

### Recent Activity
```sql
SELECT * FROM public.expiring_items_queue
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

## Configuration

### Cron Job Schedules
- **Queue Population**: `0 6 * * *` (6 AM UTC daily)
- **Queue Processing**: `*/15 * * * *` (every 15 minutes)
- **Cleanup**: `0 2 * * *` (2 AM UTC daily)

### Environment Variables
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key
- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `TELEGRAM_SEND_SECRET`: Optional secret for telegram-send function

## Testing

### Test Queue Population
```bash
curl -X POST 'https://your-project.supabase.co/functions/v1/populate-expiring-queue' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

### Test Queue Processing
```bash
curl -X POST 'https://your-project.supabase.co/functions/v1/process-expiring-queue' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

### Check Queue Status
```bash
curl 'https://your-project.supabase.co/functions/v1/expiring-items?endpoint=queue&status=pending' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```

## Troubleshooting

### Common Issues

1. **Cron jobs not running**: Check if `pg_cron` extension is enabled
2. **No notifications sent**: Verify Telegram bot token and chat_id setup
3. **Queue not populating**: Check if there are items expiring in the next 7 days
4. **High failure rate**: Check Telegram API rate limits and bot permissions

### Logs
- Cron job logs: Check Supabase dashboard → Database → Logs
- Edge Function logs: Check Supabase dashboard → Edge Functions → Logs
- PostgreSQL logs: Check Supabase dashboard → Database → Logs

## Future Enhancements

1. **Advanced Analytics**: Notification delivery rates, user engagement
2. **Customizable Schedules**: Per-user notification preferences
3. **Bulk Operations**: Batch notifications for better performance
4. **Retry Strategies**: Exponential backoff for failed notifications
5. **Notification Templates**: Customizable message formats