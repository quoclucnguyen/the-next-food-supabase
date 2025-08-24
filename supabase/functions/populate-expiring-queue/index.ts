import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

console.log('Function "populate-expiring-queue" ready to populate daily notification queue');

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const DEFAULT_DAYS_AHEAD = 7;
const BATCH_SIZE = 100; // Process items in batches for performance

// Function to determine notification priority based on days until expiry
function getNotificationPriority(daysUntilExpiry: number): string {
  if (daysUntilExpiry <= 0) return 'urgent';      // Expires today
  if (daysUntilExpiry <= 2) return 'high';        // Expires in 1-2 days
  if (daysUntilExpiry <= 6) return 'medium';      // Expires in 3-6 days
  return 'low';                                    // Expires in 7+ days
}

// Function to populate the queue for a specific day range
async function populateQueueForDayRange(daysAhead: number) {
  console.log(`Populating queue for items expiring in ${daysAhead} days`);

  // Calculate date range
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysAhead);
  const targetDateStr = targetDate.toISOString().split('T')[0];

  console.log(`Target date for ${daysAhead} days ahead: ${targetDateStr}`);

  // First, get all food items expiring on the target date
  const { data: expiringItems, error: itemsError } = await supabase
    .from('food_items')
    .select('id, user_id, name, quantity, unit, expiration_date, category')
    .eq('expiration_date', targetDateStr)
    .order('user_id');

  if (itemsError) {
    console.error('Error fetching expiring items:', itemsError);
    return { error: itemsError.message };
  }

  if (!expiringItems || expiringItems.length === 0) {
    console.log(`No items expiring in ${daysAhead} days (${targetDateStr})`);
    return { processed: 0 };
  }

  console.log(`Found ${expiringItems.length} items expiring in ${daysAhead} days`);

  // Get user chat_ids for all users with expiring items
  const userIds = [...new Set(expiringItems.map(item => item.user_id))];

  const { data: users, error: usersError } = await supabase
    .from('auth.users')
    .select('id, chat_id')
    .in('id', userIds)
    .not('chat_id', 'is', null);

  if (usersError) {
    console.error('Error fetching user chat_ids:', usersError);
    return { error: usersError.message };
  }

  if (!users || users.length === 0) {
    console.log('No users with chat_ids found for expiring items');
    return { processed: 0 };
  }

  // Create user lookup map
  const userMap = new Map(users.map(user => [user.id, user.chat_id]));

  // Prepare queue items
  const queueItems = expiringItems
    .filter(item => userMap.has(item.user_id))
    .map(item => ({
      food_item_id: item.id,
      user_id: item.user_id,
      chat_id: userMap.get(item.user_id),
      item_name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      expiration_date: item.expiration_date,
      category: item.category,
      days_until_expiry: daysAhead,
      notification_priority: getNotificationPriority(daysAhead),
      scheduled_at: new Date().toISOString(),
      status: 'pending'
    }));

  if (queueItems.length === 0) {
    console.log('No valid queue items to insert');
    return { processed: 0 };
  }

  // Insert queue items in batches
  let totalInserted = 0;
  for (let i = 0; i < queueItems.length; i += BATCH_SIZE) {
    const batch = queueItems.slice(i, i + BATCH_SIZE);

    const { error: insertError } = await supabase
      .from('expiring_items_queue')
      .upsert(batch, {
        onConflict: 'food_item_id,days_until_expiry',
        ignoreDuplicates: false
      });

    if (insertError) {
      console.error(`Error inserting batch ${i / BATCH_SIZE + 1}:`, insertError);
      return { error: insertError.message };
    }

    totalInserted += batch.length;
    console.log(`Inserted batch ${i / BATCH_SIZE + 1}: ${batch.length} items`);
  }

  console.log(`Successfully populated queue with ${totalInserted} items for ${daysAhead} days ahead`);
  return { processed: totalInserted };
}

// Main function handler
Deno.serve(async (req) => {
  const { method } = req;

  if (method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log('Starting daily queue population process');

    // Clear existing queue items that are more than 7 days old to prevent duplicates
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    const { error: cleanupError } = await supabase
      .from('expiring_items_queue')
      .delete()
      .lt('created_at', cutoffDate.toISOString());

    if (cleanupError) {
      console.error('Error cleaning up old queue items:', cleanupError);
      // Continue processing despite cleanup error
    } else {
      console.log('Cleaned up old queue items');
    }

    // Populate queue for different day ranges (0-7 days)
    const results = [];
    let totalProcessed = 0;

    for (let days = 0; days <= DEFAULT_DAYS_AHEAD; days++) {
      const result = await populateQueueForDayRange(days);
      results.push({ days_ahead: days, ...result });

      if (result.processed) {
        totalProcessed += result.processed;
      }

      // Small delay between batches to avoid overwhelming the database
      if (days < DEFAULT_DAYS_AHEAD) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Queue population completed. Total processed: ${totalProcessed}`);

    return new Response(JSON.stringify({
      success: true,
      total_processed: totalProcessed,
      results,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Unhandled error in populate-expiring-queue:', err);
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return new Response(JSON.stringify({
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});