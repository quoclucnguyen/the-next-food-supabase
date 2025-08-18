import { Bot } from "https://deno.land/x/grammy@v1.36.3/mod.ts";

console.log('Function "telegram-send" ready to send messages');

const token = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const bot = new Bot(token);

// Optional: shared secret to restrict access to this endpoint
const sendSecret = Deno.env.get('TELEGRAM_SEND_SECRET');

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

    // If a secret is configured, require it to be present and valid
    if (sendSecret) {
      const provided = req.headers.get('x-telegram-secret');
      if (!provided || provided !== sendSecret) {
        return json({ error: 'Unauthorized' }, 401);
      }
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

    const { chat_id, text, parse_mode, disable_web_page_preview, disable_notification, reply_to_message_id } = payload ?? {};
    if (!chat_id || !text) {
      return json({ error: 'Missing required fields: chat_id and text' }, 400);
    }

    const result = await bot.api.sendMessage(chat_id, text, {
      parse_mode,
      disable_web_page_preview,
      disable_notification,
      reply_to_message_id,
    });

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

