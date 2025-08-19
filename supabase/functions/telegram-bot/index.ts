import { Bot, webhookCallback } from "https://deno.land/x/grammy@v1.36.3/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Types
interface FoodItem {
  id: string;
  name: string;
  category: string;
  description?: string;
  price?: number;
}

// Initialize bot with error handling
const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
if (!botToken) {
  console.error("TELEGRAM_BOT_TOKEN environment variable is not set");
  Deno.exit(1);
}

console.log(botToken)

const bot = new Bot(botToken);

// Middleware for error handling
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  console.error(err.error);
  ctx.reply("❌ An error occurred. Please try again later.");
});

// Command handlers
bot.command("start", async (ctx) => {
  const welcomeText = `🍽️ *Welcome to Bot!*\n\n`;

  await ctx.reply(welcomeText, { parse_mode: "Markdown" });
});


// Login command
bot.command("login", async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply("❌ Could not detect your Telegram ID. Please try again later.");
    return;
  }

  // Generate a deterministic email from Telegram ID
  const email = `tg-${telegramId}@telegram.local`;

  try {
    // Generate a random password for the user
    const password = crypto.randomUUID();
    
    // Create user in auth.users
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto-confirm the email
      user_metadata: {
        telegram_id: ctx.from?.id,
        first_name: ctx.from?.first_name,
        last_name: ctx.from?.last_name,
        username: ctx.from?.username
      }
    });

    if (authError) {
      type AuthErrorShape = Error & { name?: string; status?: number };
      const e = authError as AuthErrorShape;
      console.error('Auth admin createUser error:', {
        message: authError.message,
        name: e.name,
        status: e.status,
      });
      if (authError.message.includes('already registered')) {
        await ctx.reply("✅ You're already registered! You can now use all bot features.");
        return;
      }
      throw authError;
    }

    // Store additional user data in the public.users table
    const { error: userError } = await supabase
      .from('users')
      .upsert({
        id: authData.user.id,
        telegram_id: ctx.from?.id,
        email: email,
        first_name: ctx.from?.first_name,
        last_name: ctx.from?.last_name,
        username: ctx.from?.username,
        last_login: new Date().toISOString()
      }, { onConflict: 'telegram_id' });

    if (userError) throw userError;

    await ctx.reply("✅ Registration successful! You can now use all bot features.");
  } catch (error) {
    console.error("Registration error:", error);
    try {
      // Log deeper details if present (helps with DB debugging)
      console.error('Registration error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    } catch (_) {
      // ignore
    }
    await ctx.reply("❌ An error occurred during registration. Please try again later.");
  }
});

// Handle unknown commands
bot.on("message", async (ctx) => {
  if (ctx.message?.text?.startsWith("/")) {
    await ctx.reply(
      "❌ Unknown command. Use /help to see available commands.",
      { parse_mode: "Markdown" }
    );
  }
});

// Webhook setup
const handleUpdate = webhookCallback(bot, "std/http");

// HTTP server
Deno.serve(async (req) => {
  try {
    if (req.method === "POST") {
      return await handleUpdate(req);
    }
    return new Response("OK");
  } catch (err) {
    console.error("Error handling request:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});