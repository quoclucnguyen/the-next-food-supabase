# AI Coding Assistant Instructions for The Next Food Supabase

## Project Overview
This is a Supabase-based food expiration tracking system with automated Telegram notifications. The system uses a queue-based architecture with cron jobs to send timely alerts about expiring food items.

## Architecture & Key Components

### Core System Architecture
- **Database**: PostgreSQL with Supabase (pg_cron, pg_net extensions)
- **Backend**: Deno/TypeScript Edge Functions
- **Notifications**: Telegram Bot API with rate limiting
- **Scheduling**: Cron jobs for automated queue management

### Critical Data Flow
```
Food Items → Database Triggers → Notification Queue → Cron Jobs → Edge Functions → Telegram Bot → Users
```

### Key Tables
- `food_items`: User food inventory with expiration dates
- `expiring_items_queue`: Notification staging with priority levels (urgent/high/medium/low)
- `auth.users`: Extended with `chat_id` for Telegram integration

## Development Environment Setup

### Required Tools
- Supabase CLI (`supabase`)
- Deno runtime (configured in VS Code)
- PostgreSQL 17

### VS Code Configuration
- Deno extension enabled for `supabase/functions/` directory
- Unstable Deno features enabled (see `.vscode/settings.json`)

### Local Development
```bash
# Start local Supabase stack
supabase start

# Deploy functions
supabase functions deploy

# Run migrations
supabase db push
```

## Edge Function Patterns

### Standard Function Structure
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// CORS helper - REQUIRED for all functions
function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  };
}

// Initialize Supabase client - REQUIRED
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  // CORS preflight handling - REQUIRED
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req.headers.get('Origin')) });
  }

  // Main logic here
});
```

### Authentication Patterns
- **Service Role**: Internal functions use `SUPABASE_SERVICE_ROLE_KEY`
- **Secret-based**: Telegram functions use `TELEGRAM_SEND_SECRET` header
- **Dual Auth**: `telegram-send` supports both service role and secret authentication

### Error Handling
```typescript
try {
  // Function logic
} catch (error) {
  console.error('Error details:', error);
  return new Response(
    JSON.stringify({ error: error.message }),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
    }
  );
}
```

## Notification System Architecture

### Queue-Based Processing
- **Population**: Daily cron job (6 AM UTC) finds items expiring 0-7 days ahead
- **Processing**: Every 15 minutes, processes queue with priority ordering
- **Priority Levels**: urgent (today) → high (1-2 days) → medium (3-6 days) → low (7+ days)

### Batch Processing Limits
- **Queue Population**: 100 items per batch
- **Queue Processing**: 50 items per batch, 100ms delay between notifications
- **Rate Limiting**: 30 requests/minute per IP in telegram-send

### Message Templates
```typescript
// Urgent (expires today)
'🚨 ALERT: Your {quantity} {name} ({unit}) expires TODAY!'

// High (expires tomorrow)
'⚠️ WARNING: Your {quantity} {name} ({unit}) expires TOMORROW!'

// Medium/Low (expires in N days)
'📅 REMINDER: Your {quantity} {name} ({unit}) expires in {days} days.'
```

## Database Patterns

### Migration Structure
```sql
BEGIN;
-- Schema changes here
COMMIT;
```

### RLS Policies
- Users can only access their own data
- Service role has full access
- Queue table: `auth.uid() = user_id` for user access

### Cron Job Setup
```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule job
SELECT cron.schedule(
  'job-name',
  'cron-expression', -- e.g., '0 6 * * *' for daily 6 AM
  $$ SQL query or function call $$
);
```

## Testing & Debugging

### Test Data Setup
- Use migrations in `migrations/` with timestamps
- Test migrations: `20250824102000_test_expiring_food_notifications.sql`
- Rollback migrations: `20250824103000_rollback_test_expiring_food_notifications.sql`

### Interactive Testing
- Run `supabase/test-notification-system.sql` for end-to-end testing
- Check Edge Function logs in Supabase dashboard
- Monitor cron job execution in Database > Cron section

### Common Debug Commands
```bash
# Check queue status
SELECT status, count(*) FROM expiring_items_queue GROUP BY status;

# View recent notifications
SELECT * FROM expiring_items_queue
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

## Deployment & Environment

### Environment Variables
- `SUPABASE_URL`: Project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key
- `TELEGRAM_BOT_TOKEN`: Bot API token
- `TELEGRAM_SEND_SECRET`: Optional function access secret

### Deployment Order
1. Database migrations (`supabase db push`)
2. Edge functions (`supabase functions deploy`)
3. Environment variables in Supabase dashboard
4. Test with `supabase/test-notification-system.sql`

## Code Quality Standards

### TypeScript/Deno Best Practices
- Use explicit types, avoid `any`
- Handle null/undefined values properly
- Use async/await consistently
- Log errors with context

### Database Best Practices
- Use transactions for multi-step operations
- Add appropriate indexes for query performance
- Use RLS policies for data security
- Add comments to complex functions/tables

### Error Messages
- User-facing: Generic but helpful
- Logs: Detailed with context and IDs
- Never expose sensitive data in responses

## Common Gotchas

### Telegram Integration
- Users must have `chat_id` set in `auth.users`
- Bot must be configured and have proper permissions
- Rate limits apply (30/minute default)

### Cron Jobs
- Use UTC timezone for scheduling
- Jobs run in database context, not application context
- Monitor execution in Supabase dashboard

### Queue Processing
- Items marked `processing` during work to prevent duplicate processing
- Failed items stay in queue for retry logic
- Cleanup removes items older than 30 days

## File Organization
- `supabase/migrations/`: Database schema changes (timestamped)
- `supabase/functions/`: Edge Functions (Deno/TypeScript)
- `supabase/seed.sql`: Initial data for local development
- `supabase/README-*.md`: Documentation for specific features</content>
<parameter name="filePath">/home/quocl/workspaces/the-next-food-supabase/.github/copilot-instructions.md