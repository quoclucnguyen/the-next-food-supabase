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

// Initialize bot with error handling
const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
if (!botToken) {
  console.error("TELEGRAM_BOT_TOKEN environment variable is not set");
  Deno.exit(1);
}

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
    // Check if user already exists by telegram_id
    const { data: existingUserByTelegramId, error: checkTelegramError } = await supabase
      .from('users')
      .select('id, telegram_id, email')
      .eq('telegram_id', telegramId)
      .single();

    if (checkTelegramError && checkTelegramError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error checking existing user by telegram_id:', checkTelegramError);
      throw checkTelegramError;
    }

    if (existingUserByTelegramId) {
      await ctx.reply("✅ You are already registered! You can use all bot features.");
      return;
    }

    // Check if user already exists by email before creating
    const { data: existingUserByEmail, error: checkEmailError } = await supabase
      .from('users')
      .select('id, telegram_id, email')
      .eq('email', email)
      .single();

    if (checkEmailError && checkEmailError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error checking existing user by email:', checkEmailError);
      throw checkEmailError;
    }

    if (existingUserByEmail) {
      console.warn(`User with email ${email} already exists but with different telegram_id: ${existingUserByEmail.telegram_id}`);
      await ctx.reply("❌ This Telegram ID is already associated with an account. Please contact support if you believe this is an error.");
      return;
    }

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
        await ctx.reply("✅ Registration successful! You can now use all bot features.");
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
        chat_id: ctx.chat?.id,
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
   
    await ctx.reply("❌ An error occurred during registration. Please try again later.");
  }
});

// Middleware to capture and save chat information on every message
bot.use(async (ctx, next) => {
  // Skip if no message or no user information
  if (!ctx.message || !ctx.from?.id) {
    return next();
  }

  const telegramId = ctx.from.id;
  const chatId = ctx.chat?.id;

  if (telegramId && chatId) {
    try {
      // Generate deterministic email for the user
      const email = `tg-${telegramId}@telegram.local`;

      // Upsert user information into public.users table
      const { error } = await supabase
        .from('users')
        .upsert({
          telegram_id: telegramId,
          chat_id: chatId,
          email: email,
          first_name: ctx.from.first_name,
          last_name: ctx.from.last_name,
          username: ctx.from.username,
          last_login: new Date().toISOString()
        }, {
          onConflict: 'telegram_id'
        });

      if (error) {
        console.error('Error upserting user chat info:', error);
        // Don't throw error to avoid breaking message handling
      }
    } catch (error) {
      console.error('Error in chat info middleware:', error);
      // Continue with message processing even if chat info saving fails
    }
  }

  // Continue to next middleware/handler
  return next();
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