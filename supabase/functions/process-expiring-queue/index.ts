import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Type definitions
interface QueueItem {
  id: string;
  food_item_id: string;
  user_id: string;
  chat_id: number;
  item_name: string;
  quantity: number;
  unit: string;
  category: string;
  expiration_date: string;
  days_until_expiry: number;
  notification_priority: number;
  scheduled_at: string;
  status: string;
  created_at: string;
  updated_at: string;
  processed_at?: string;
}

interface NotificationResult {
  success: boolean;
  error?: string;
}

interface BatchResult {
  processed: number;
  sent: number;
  failed: number;
}

interface UpdateData {
  status: string;
  updated_at: string;
  processed_at?: string;
}

console.log('Function "process-expiring-queue" ready to process notification queue');

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const BATCH_SIZE = 50; // Process items in batches
const MAX_RETRIES = 3; // Maximum retry attempts for failed notifications
const RATE_LIMIT_DELAY = 100; // Delay between individual notifications (ms)

// Function to create notification message
function createNotificationMessage(item: QueueItem): string {
  const { item_name, quantity, unit, category, days_until_expiry } = item;

  let message = '';

  if (days_until_expiry === 0) {
    message = `🚨 ALERT: Your ${quantity} ${unit} of ${item_name} expires TODAY!`;
  } else if (days_until_expiry === 1) {
    message = `⚠️ WARNING: Your ${quantity} ${unit} of ${item_name} expires TOMORROW!`;
  } else {
    message = `📅 REMINDER: Your ${quantity} ${unit} of ${item_name} expires in ${days_until_expiry} days.`;
  }

  message += `\n📂 Category: ${category}`;

  return message;
}

// Function to send notification via telegram-send Edge Function
async function sendTelegramNotification(chatId: string, message: string, itemId: string): Promise<NotificationResult> {
  try {
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/telegram-send`;

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        source: 'queue_processor'
      }),
    });

    const result = await response.json();

    if (result.ok) {
      console.log(`Successfully sent notification to chat ${chatId} for item ${itemId}`);
      return { success: true };
    } else {
      console.error(`Failed to send notification to chat ${chatId}: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error(`Error sending notification to chat ${chatId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Function to update queue item status
async function updateQueueItemStatus(itemId: string, status: string, processedAt?: string) {
  const updateData: UpdateData = {
    status,
    updated_at: new Date().toISOString()
  };

  if (processedAt) {
    updateData.processed_at = processedAt;
  }

  const { error } = await supabase
    .from('expiring_items_queue')
    .update(updateData)
    .eq('id', itemId);

  if (error) {
    console.error(`Error updating queue item ${itemId}:`, error);
  }
}

// Function to process a batch of queue items
async function processQueueBatch(items: QueueItem[]): Promise<BatchResult> {
  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    try {
      // Mark as processing
      await updateQueueItemStatus(item.id, 'processing');

      // Create notification message
      const message = createNotificationMessage(item);

      // Send notification
      const notificationResult = await sendTelegramNotification(
        item.chat_id.toString(),
        message,
        item.food_item_id
      );

      if (notificationResult.success) {
        await updateQueueItemStatus(item.id, 'sent', new Date().toISOString());
        sent++;
      } else {
        console.error(`Failed to send notification for item ${item.id}: ${notificationResult.error}`);
        await updateQueueItemStatus(item.id, 'failed');
        failed++;
      }

      processed++;

      // Rate limiting delay
      if (processed < items.length) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }

    } catch (error) {
      console.error(`Error processing queue item ${item.id}:`, error);
      await updateQueueItemStatus(item.id, 'failed');
      failed++;
      processed++;
    }
  }

  return { processed, sent, failed };
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
    console.log('Starting queue processing');

    // Get pending queue items ordered by priority and scheduled time
    const { data: queueItems, error: fetchError } = await supabase
      .from('expiring_items_queue')
      .select('*')
      .eq('status', 'pending')
      .order('notification_priority', { ascending: false }) // urgent first
      .order('scheduled_at', { ascending: true }) // then by scheduled time
      .limit(1000); // Process up to 1000 items at a time

    if (fetchError) {
      console.error('Error fetching queue items:', fetchError);
      return new Response(JSON.stringify({
        success: false,
        error: fetchError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!queueItems || queueItems.length === 0) {
      console.log('No pending queue items to process');
      return new Response(JSON.stringify({
        success: true,
        message: 'No pending items to process',
        processed: 0,
        sent: 0,
        failed: 0
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${queueItems.length} pending queue items to process`);

    // Process items in batches
    let totalProcessed = 0;
    let totalSent = 0;
    let totalFailed = 0;

    for (let i = 0; i < queueItems.length; i += BATCH_SIZE) {
      const batch = queueItems.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${i / BATCH_SIZE + 1}/${Math.ceil(queueItems.length / BATCH_SIZE)}`);

      const batchResult = await processQueueBatch(batch);

      totalProcessed += batchResult.processed;
      totalSent += batchResult.sent;
      totalFailed += batchResult.failed;

      console.log(`Batch ${i / BATCH_SIZE + 1} results: ${batchResult.processed} processed, ${batchResult.sent} sent, ${batchResult.failed} failed`);
    }

    console.log(`Queue processing completed. Total: ${totalProcessed} processed, ${totalSent} sent, ${totalFailed} failed`);

    return new Response(JSON.stringify({
      success: true,
      total_processed: totalProcessed,
      total_sent: totalSent,
      total_failed: totalFailed,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Unhandled error in process-expiring-queue:', err);
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