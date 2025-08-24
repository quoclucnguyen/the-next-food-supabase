import { Bot } from "https://deno.land/x/grammy@v1.36.3/mod.ts";

console.log('Function "telegram-send" ready to send messages');

const token = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const bot = new Bot(token);

// Optional: shared secret to restrict access to this endpoint
const sendSecret = Deno.env.get('TELEGRAM_SEND_SECRET');

// Rate limiting: simple in-memory store for demo (use Redis in production)
const rateLimit = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_REQUESTS = 30; // requests per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds

// Service role key for internal calls from database triggers
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Authentication function supporting both secret-based and service role authentication
function authenticateRequest(req: Request): boolean {
  // If a secret is configured, check for x-telegram-secret header
  if (sendSecret) {
    const providedSecret = req.headers.get('x-telegram-secret');
    if (providedSecret && providedSecret === sendSecret) {
      return true;
    }
  }

  // Check for service role authentication (for internal database trigger calls)
  if (serviceRoleKey) {
    const authHeader = req.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring('Bearer '.length);
      if (token === serviceRoleKey) {
        return true;
      }
    }
  }

  return false;
}

// Rate limiting function
function checkRateLimit(clientIP: string): boolean {
  const now = Date.now();
  const clientData = rateLimit.get(clientIP);

  if (!clientData || now > clientData.resetTime) {
    // First request or window expired, reset counter
    rateLimit.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (clientData.count >= RATE_LIMIT_REQUESTS) {
    return false; // Rate limit exceeded
  }

  // Increment counter
  clientData.count++;
  return true;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { 'Allow': 'POST' }
      });
    }

    if (!token) {
      return json({ error: 'Missing TELEGRAM_BOT_TOKEN' }, 500);
    }

    // Enhanced authentication: support both secret-based and service role authentication
    const isAuthenticated = authenticateRequest(req);
    if (!isAuthenticated) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return json({ error: 'Unsupported Media Type: expected application/json' }, 415);
    }

    let payload: any;
    try {
      payload = await req.json();
    } catch (_) {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const { chat_id, text, parse_mode, disable_web_page_preview, disable_notification, reply_to_message_id, source } = payload ?? {};
    if (!chat_id || !text) {
      return json({ error: 'Missing required fields: chat_id and text' }, 400);
    }

    // Rate limiting check
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(clientIP)) {
      console.warn(`Rate limit exceeded for IP: ${clientIP}`);
      return json({ error: 'Rate limit exceeded. Please try again later.' }, 429);
    }

    // Enhanced logging for debugging
    const sourceInfo = source || (req.headers.get('Authorization')?.includes('Bearer') ? 'internal' : 'external');
    console.log(`Sending message to chat ${chat_id} from ${sourceInfo} source`);

    // Build sendMessage options object
    const sendOptions: any = {};
    if (parse_mode) sendOptions.parse_mode = parse_mode;
    if (disable_web_page_preview !== undefined) sendOptions.disable_web_page_preview = disable_web_page_preview;
    if (disable_notification !== undefined) sendOptions.disable_notification = disable_notification;
    if (reply_to_message_id) sendOptions.reply_to_message_id = reply_to_message_id;

    const result = await bot.api.sendMessage(chat_id, text, sendOptions);

    console.log(`Message sent successfully to chat ${chat_id}: ${result.message_id}`);
    return json({ ok: true, result });
  } catch (err) {
    console.error('telegram-send error:', err);
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return json({ ok: false, error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

