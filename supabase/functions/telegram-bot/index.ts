import { Bot, webhookCallback, Context, InlineKeyboard } from "https://deno.land/x/grammy@v1.36.3/mod.ts";
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

// Constants
const COMMANDS = {
  start: "Start the bot and see welcome message",
  help: "Show all available commands",
  menu: "Browse food categories",
  random: "Get a random food suggestion",
  search: "Search for specific foods (e.g., /search pizza)",
  login: "Login or register with your email"
};

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
  const welcomeText = `🍽️ *Welcome to Foodie Bot!* 🍕\n\n` +
    `I can help you discover delicious foods and manage your orders.\n\n` +
    `Use /help to see all available commands.`;

  await ctx.reply(welcomeText, { parse_mode: "Markdown" });
});

bot.command("help", async (ctx) => {
  let helpText = "*Available Commands:*\n\n";
  Object.entries(COMMANDS).forEach(([command, description]) => {
    helpText += `/${command} - ${description}\n`;
  });
  
  await ctx.reply(helpText, { parse_mode: "Markdown" });
});

bot.command("menu", async (ctx) => {
  const categories = ["🍕 Pizza", "🍔 Burgers", "🍣 Sushi", "🥗 Salads", "🍝 Pasta"];
  const keyboard = new InlineKeyboard();
  
  // Add categories in two columns
  for (let i = 0; i < categories.length; i += 2) {
    const row = categories.slice(i, i + 2);
    keyboard.text(row[0].split(" ")[1], `category_${row[0].split(" ")[1].toLowerCase()}`);
    if (row[1]) {
      keyboard.text(row[1].split(" ")[1], `category_${row[1].split(" ")[1].toLowerCase()}`);
    }
    keyboard.row();
  }

  await ctx.reply("🍽️ *Choose a category:*", {
    reply_markup: keyboard,
    parse_mode: "Markdown"
  });
});

bot.command("random", async (ctx) => {
  // In a real app, fetch from your database
  const foods: FoodItem[] = [
    { id: "1", name: "Margherita Pizza", category: "pizza", price: 12.99 },
    { id: "2", name: "Chicken Burger", category: "burgers", price: 9.99 },
    { id: "3", name: "California Roll", category: "sushi", price: 15.99 }
  ];
  
  const randomFood = foods[Math.floor(Math.random() * foods.length)];
  await ctx.reply(
    `🍴 *Random Suggestion:* ${randomFood.name}\n` +
    `💵 Price: $${randomFood.price}\n` +
    `📋 Category: ${randomFood.category}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("search", async (ctx) => {
  const query = ctx.match;
  if (!query) {
    await ctx.reply("Please provide a search term. Example: /search pizza");
    return;
  }

  // In a real app, search your database
  const results: FoodItem[] = [
    { id: "1", name: "Margherita Pizza", category: "pizza", price: 12.99 },
    { id: "2", name: "Pepperoni Pizza", category: "pizza", price: 14.99 }
  ].filter(food => 
    food.name.toLowerCase().includes(query.toLowerCase())
  );

  if (results.length === 0) {
    await ctx.reply(`No results found for "${query}"`);
    return;
  }

  let response = `🔍 *Search Results for "${query}":*\n\n`;
  results.forEach((food, index) => {
    response += `${index + 1}. *${food.name}* - $${food.price}\n`;
  });

  await ctx.reply(response, { parse_mode: "Markdown" });
});

// Login command
bot.command("login", async (ctx) => {
  const email = ctx.match.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!email || !emailRegex.test(email)) {
    await ctx.reply("Please provide a valid email address. Example: /login your@email.com");
    return;
  }

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