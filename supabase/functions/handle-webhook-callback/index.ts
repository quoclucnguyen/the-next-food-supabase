import { serve } from "https://deno.land/std/http/server.ts";
import { Bot } from "https://deno.land/x/grammy@v1.36.3/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Environment variables
const token = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const bot = new Bot(token);

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// Logging helper
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[handle-webhook-callback] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[handle-webhook-callback] ERROR: ${message}`, error?.message || error);
  },
  warn: (message: string, data?: any) => {
    console.warn(`[handle-webhook-callback] WARNING: ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
};

// Initialize logging
logger.info('Function initialized', {
  hasToken: !!token,
  hasSupabaseUrl: !!supabaseUrl,
  hasSupabaseKey: !!supabaseKey
});

interface FoodItemRecord {
  id: string;
  unit: string;
  status: string;
  chat_id: number;
  user_id: string;
  category: string;
  quantity: number;
  item_name: string;
  created_at: string;
  updated_at: string;
  food_item_id: string;
  processed_at: string | null;
  scheduled_at: string;
  expiration_date: string;
  days_until_expiry: number;
  notification_priority: string;
}

// Helper function to format date to dd/mm/yyyy
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (error) {
    logger.warn('Failed to format date, using original', { dateString, error });
    return dateString; // Fallback to original if parsing fails
  }
}

function formatTelegramMessage(record: FoodItemRecord): string {
  const { item_name, category, quantity, unit, expiration_date, days_until_expiry, notification_priority } = record;

  const priorityEmoji = notification_priority === 'urgent' ? '🚨' : '⚠️';
  const categoryEmoji = {
    'snacks': '🍪',
    'dairy': '🥛',
    'meat': '🥩',
    'vegetables': '🥕',
    'fruits': '🍎',
    'beverages': '🥤',
    'other': '📦'
  }[category] || '📦';

  // Format expiration_date to dd/mm/yyyy
  const formattedExpirationDate = formatDate(expiration_date);

  logger.info('Date formatting', {
    original: expiration_date,
    formatted: formattedExpirationDate
  });

  return `${priorityEmoji} *Item is coming date ${formattedExpirationDate}*

${categoryEmoji} *Item:* ${item_name}
📊 *Quantity:* ${quantity} ${unit}
📅 *Expires:* ${formattedExpirationDate}
⏰ *Days until expiry:* ${days_until_expiry}

Category: ${category.charAt(0).toUpperCase() + category.slice(1)}`;
}

async function sendTelegramNotification(record: FoodItemRecord): Promise<void> {
  logger.info('Starting Telegram notification', {
    food_item_id: record.food_item_id,
    chat_id: record.chat_id,
    item_name: record.item_name
  });

  if (!token) {
    logger.warn('TELEGRAM_BOT_TOKEN is missing - cannot send notification');
    return;
  }

  try {
    // Fetch image_url from food_items table using food_item_id
    logger.info('Fetching image_url from database', { food_item_id: record.food_item_id });
    const { data: foodItem, error: fetchError } = await supabase
      .from('food_items')
      .select('image_url')
      .eq('id', record.food_item_id)
      .single();

    if (fetchError) {
      logger.error('Failed to fetch food item image_url', fetchError);
      // Continue with text message if fetch fails
    }

    const message = formatTelegramMessage(record);
    logger.info('Formatted message', { messageLength: message.length, hasImage: !!foodItem?.image_url });

    // Send photo if image_url exists, otherwise send text message
    if (foodItem?.image_url) {
      logger.info('Sending photo message', {
        chat_id: record.chat_id,
        image_url: foodItem.image_url.substring(0, 50) + '...' // Log partial URL for privacy
      });

      const result = await bot.api.sendPhoto(record.chat_id, foodItem.image_url, {
        caption: message,
        parse_mode: 'Markdown'
      });

      logger.info('Photo message sent successfully', {
        chat_id: record.chat_id,
        message_id: result.message_id
      });
    } else {
      logger.info('Sending text message (no image available)', {
        chat_id: record.chat_id,
        reason: fetchError ? 'fetch_error' : 'no_image_url'
      });

      const result = await bot.api.sendMessage(record.chat_id, message, {
        parse_mode: 'Markdown'
      });

      logger.info('Text message sent successfully', {
        chat_id: record.chat_id,
        message_id: result.message_id
      });
    }
  } catch (error) {
    logger.error('Failed to send Telegram notification', error);
    // Don't throw - we don't want webhook processing to fail due to notification issues
  }
}

serve(async (req) => {
  const startTime = Date.now();
  logger.info('=== New request received ===');
  logger.info('Request details', {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries())
  });

  if (req.method !== "POST") {
    logger.warn('Invalid method', { method: req.method, allowed: 'POST' });
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload;
  try {
    payload = await req.json();
    logger.info('Payload parsed successfully', {
      payloadSize: JSON.stringify(payload).length,
      hasRecord: !!payload.record,
      hasOldRecord: !!payload.old_record
    });
  } catch (err) {
    logger.error('Failed to parse JSON payload', err);
    return new Response("Bad Request: invalid JSON", { status: 400 });
  }

  // Extract webhook data
  const { type, table, schema, record, old_record } = payload;

  logger.info('Expiring items queue webhook event', {
    type,
    table,
    schema,
    recordId: record?.id,
    oldRecordId: old_record?.id,
    isExpiringQueueEvent: table === 'expiring_items_queue'
  });

  // Log record details for debugging
  if (record) {
    logger.info('New record details', {
      id: record.id,
      item_name: record.item_name,
      category: record.category,
      chat_id: record.chat_id,
      food_item_id: record.food_item_id,
      expiration_date: record.expiration_date,
      formatted_expiration_date: formatDate(record.expiration_date),
      days_until_expiry: record.days_until_expiry
    });
  }

  if (old_record) {
    logger.info('Old record details', {
      id: old_record.id,
      item_name: old_record.item_name,
      category: old_record.category
    });
  }

  // Check if we should send notification
  const shouldSendNotification = record && type === 'INSERT' && table === 'expiring_items_queue' && record.chat_id;

  logger.info('Notification decision', {
    hasRecord: !!record,
    isInsert: type === 'INSERT',
    isExpiringQueueTable: table === 'expiring_items_queue',
    hasChatId: !!record?.chat_id,
    shouldSendNotification
  });

  // Send Telegram notification if this is a new expiring item record
  if (shouldSendNotification) {
    try {
      logger.info('Sending Telegram notification...');
      await sendTelegramNotification(record as FoodItemRecord);
      logger.info('Telegram notification completed');
    } catch (error) {
      logger.error('Error in sendTelegramNotification', error);
      // Continue processing even if notification fails
    }
  } else {
    logger.info('Skipping Telegram notification', {
      reason: !record ? 'no_record' :
              type !== 'INSERT' ? 'not_insert' :
              table !== 'expiring_items_queue' ? 'not_expiring_items_queue_table' :
              !record.chat_id ? 'no_chat_id' : 'unknown'
    });
  }

  const processingTime = Date.now() - startTime;
  logger.info('=== Request completed ===', {
    processingTimeMs: processingTime,
    status: 'success'
  });

  return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
});
