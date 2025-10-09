import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Type definitions
interface ExpiringFoodItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  unit: string;
  expiration_date: string;
  category: string;
  image_url?: string;
  days_until_expiry: number;
  priority: 'urgent' | 'high' | 'medium' | 'low';
}

interface CheckExpiringItemsOptions {
  daysAhead?: number;
  userId?: string;
  category?: string;
  includeExpired?: boolean;
  sortBy?: 'expiration_date' | 'name' | 'priority' | 'category';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

interface CheckExpiringItemsResult {
  items: ExpiringFoodItem[];
  total_count: number;
  days_ahead: number;
  filters_applied: {
    user_id?: string;
    category?: string;
    include_expired: boolean;
  };
  summary: {
    urgent: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
}

// CORS helper
function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  } as Record<string, string>;
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Function to determine priority based on days until expiry
function getPriority(daysUntilExpiry: number): 'urgent' | 'high' | 'medium' | 'low' {
  if (daysUntilExpiry < 0) return 'urgent';      // Already expired
  if (daysUntilExpiry <= 0) return 'urgent';     // Expires today
  if (daysUntilExpiry <= 2) return 'high';       // Expires in 1-2 days
  if (daysUntilExpiry <= 6) return 'medium';     // Expires in 3-6 days
  return 'low';                                  // Expires in 7+ days
}

// Function to calculate days until expiry
function calculateDaysUntilExpiry(expirationDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiryDate = new Date(expirationDate);
  expiryDate.setHours(0, 0, 0, 0);

  const diffTime = expiryDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Interface for expiring items queue record
interface ExpiringQueueRecord {
  food_item_id?: string;
  cosmetic_id?: string;
  user_id: string;
  chat_id: number;
  item_name: string;
  quantity: number;
  unit: string;
  expiration_date: string;
  category: string;
  days_until_expiry: number;
  notification_priority: 'urgent' | 'high' | 'medium' | 'low';
  status?: string;
  scheduled_at?: string;
}

// Interface for merged item (food or cosmetic)
interface MergedItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  unit: string;
  expiration_date: string;
  category: string;
  image_url?: string;
  type: 'food' | 'cosmetic';
}

// Function to insert items into expiring_items_queue
async function insertIntoExpiringQueue(items: MergedItem[], usersMap: Map<string, number>): Promise<number> {
  console.log(`Inserting ${items.length} items into expiring_items_queue`);

  const queueRecords: ExpiringQueueRecord[] = items.map(item => ({
    food_item_id: item.type === 'food' ? item.id : null,
    cosmetic_id: item.type === 'cosmetic' ? item.id : null,
    user_id: item.user_id,
    chat_id: usersMap.get(item.user_id) || 0,
    item_name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    expiration_date: item.expiration_date,
    category: item.category,
    days_until_expiry: calculateDaysUntilExpiry(item.expiration_date),
    notification_priority: getPriority(calculateDaysUntilExpiry(item.expiration_date)),
    status: 'pending',
    scheduled_at: new Date().toISOString()
  }));

  // Log từng record trước khi insert để debug
  console.log('Queue records to insert:');
  queueRecords.forEach((record, index) => {
    console.log(`Record ${index + 1}:`, {
      item_name: record.item_name,
      food_item_id: record.food_item_id,
      cosmetic_id: record.cosmetic_id,
      user_id: record.user_id,
      chat_id: record.chat_id,
      expiration_date: record.expiration_date,
      category: record.category,
      has_required_fields: !!(record.user_id && record.chat_id && record.expiration_date && record.item_name)
    });
  });

  // Try inserting one by one to catch specific errors
  let successCount = 0;
  const errors: any[] = [];

  for (let i = 0; i < queueRecords.length; i++) {
    const record = queueRecords[i];
    console.log(`Inserting record ${i + 1}/${queueRecords.length}: ${record.item_name}`);

    try {
      const { error } = await supabase
        .from('expiring_items_queue')
        .insert([record]);

      if (error) {
        console.error(`Failed to insert record ${i + 1}:`, {
          item_name: record.item_name,
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        errors.push({ record: record.item_name, error });
      } else {
        console.log(`✅ Successfully inserted record ${i + 1}: ${record.item_name}`);
        successCount++;
      }
    } catch (err) {
      console.error(`Exception inserting record ${i + 1}:`, {
        item_name: record.item_name,
        error: err
      });
      errors.push({ record: record.item_name, error: err });
    }
  }

  console.log(`Insert summary: ${successCount}/${queueRecords.length} successful, ${errors.length} errors`);

  if (errors.length > 0) {
    console.error('All errors:', errors);
    // Don't throw error - return partial success count
  }

  return successCount;
}

// Main function to check for expiring items
async function checkExpiringItems(options: CheckExpiringItemsOptions = {}): Promise<CheckExpiringItemsResult> {
  const {
    daysAhead = 7,
    userId,
    category,
    includeExpired = false,
    sortBy = 'expiration_date',
    sortOrder = 'asc',
    limit = 1000
  } = options;

  console.log(`Checking for items expiring within ${daysAhead} days`);

  // Calculate date range
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + daysAhead);

  // Query food_items without JOIN (Option 2 approach)
  let query = supabase
    .from('food_items')
    .select('id, user_id, name, quantity, unit, expiration_date, category, image_url')
    .gte('expiration_date', today.toISOString().split('T')[0])
    .lte('expiration_date', futureDate.toISOString().split('T')[0]);

  // Apply filters
  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (category) {
    query = query.eq('category', category);
  }

  // Apply sorting
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });

  // Apply limit
  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data: rawItems, error } = await query;

  if (error) {
    console.error('Error fetching expiring items:', error);
    throw new Error(`Failed to fetch expiring items: ${error.message}`);
  }

  if (!rawItems || rawItems.length === 0) {
    return {
      items: [],
      total_count: 0,
      days_ahead: daysAhead,
      filters_applied: {
        user_id: userId,
        category,
        include_expired: includeExpired
      },
      summary: {
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
        total: 0
      }
    };
  }

  // Get unique user_ids from items
  const userIds = [...new Set(rawItems.map(item => item.user_id))];

  // Query users table to get chat_ids
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, chat_id')
    .in('id', userIds);

  if (usersError) {
    console.error('Error fetching users:', usersError);
    throw new Error(`Failed to fetch users: ${usersError.message}`);
  }

  // Create map of user_id -> chat_id
  const usersMap = new Map(users?.map(user => [user.id, user.chat_id]) || []);

  // Filter items to only include those with chat_id and process them
  const itemsWithChatId = rawItems.filter(item => usersMap.get(item.user_id));

  // Process items and calculate additional data
  const processedItems: ExpiringFoodItem[] = itemsWithChatId.map(item => {
    const daysUntilExpiry = calculateDaysUntilExpiry(item.expiration_date);
    const priority = getPriority(daysUntilExpiry);

    return {
      id: item.id,
      user_id: item.user_id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      expiration_date: item.expiration_date,
      category: item.category,
      image_url: item.image_url,
      days_until_expiry: daysUntilExpiry,
      priority
    };
  });

  // Filter out expired items if not included
  const filteredItems = includeExpired
    ? processedItems
    : processedItems.filter(item => item.days_until_expiry >= 0);

  // Calculate summary statistics
  const summary = {
    urgent: filteredItems.filter(item => item.priority === 'urgent').length,
    high: filteredItems.filter(item => item.priority === 'high').length,
    medium: filteredItems.filter(item => item.priority === 'medium').length,
    low: filteredItems.filter(item => item.priority === 'low').length,
    total: filteredItems.length
  };

  console.log(`Found ${filteredItems.length} items expiring within ${daysAhead} days (with chat_id)`);

  return {
    items: filteredItems,
    total_count: filteredItems.length,
    days_ahead: daysAhead,
    filters_applied: {
      user_id: userId,
      category,
      include_expired: includeExpired
    },
    summary
  };
}

// HTTP server handler
Deno.serve(async (req) => {
  const { method, headers } = req;
  const origin = headers.get('Origin');

  // Handle CORS preflight requests
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(origin) });
  }

  if (method !== 'GET' && method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  try {
    let options: CheckExpiringItemsOptions = {};

    if (method === 'GET') {
      // Parse query parameters for GET requests
      const url = new URL(req.url);
      const daysAhead = url.searchParams.get('days');
      const userId = url.searchParams.get('user_id');
      const category = url.searchParams.get('category');
      const includeExpired = url.searchParams.get('include_expired') === 'true';
      const sortBy = url.searchParams.get('sort_by') as CheckExpiringItemsOptions['sortBy'];
      const sortOrder = url.searchParams.get('sort_order') as CheckExpiringItemsOptions['sortOrder'];
      const limit = url.searchParams.get('limit');

      options = {
        daysAhead: daysAhead ? parseInt(daysAhead) : undefined,
        userId: userId || undefined,
        category: category || undefined,
        includeExpired,
        sortBy: sortBy || undefined,
        sortOrder: sortOrder || undefined,
        limit: limit ? parseInt(limit) : undefined
      };
    } else if (method === 'POST') {
      // Parse JSON body for POST requests
      const body = await req.json();
      options = {
        daysAhead: body.days_ahead,
        userId: body.user_id,
        category: body.category,
        includeExpired: body.include_expired,
        sortBy: body.sort_by,
        sortOrder: body.sort_order,
        limit: body.limit
      };
    }

    // Validate options
    if (options.daysAhead !== undefined && (!Number.isFinite(options.daysAhead) || options.daysAhead < 0)) {
      options.daysAhead = 7;
    }
    if (options.daysAhead !== undefined && options.daysAhead > 365) {
      options.daysAhead = 365; // Cap at 1 year to prevent abuse
    }

    if (options.limit !== undefined && (!Number.isFinite(options.limit) || options.limit < 0)) {
      options.limit = 1000;
    }
    if (options.limit !== undefined && options.limit > 10000) {
      options.limit = 10000; // Cap at 10k to prevent abuse
    }

    console.log('Check expiring items request:', options);

    if (method === 'GET') {
      // GET: Just return the items (existing flow)
      const result = await checkExpiringItems(options);

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    } else if (method === 'POST') {
      // POST: Find items and insert into expiring_items_queue
      console.log('POST request - will insert items into expiring_items_queue');

      // First, get the items (but we need the raw items with chat_id for queue insertion)
      const {
        daysAhead = 7,
        userId,
        category,
        includeExpired = false,
        sortBy = 'expiration_date',
        sortOrder = 'asc',
        limit = 1000
      } = options;

      // Calculate date range
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + daysAhead);

      // Query food_items
      console.log('Querying food_items...');
      let foodQuery = supabase
        .from('food_items')
        .select('id, user_id, name, quantity, unit, expiration_date, category, image_url')
        .gte('expiration_date', today.toISOString().split('T')[0])
        .lte('expiration_date', futureDate.toISOString().split('T')[0]);

      // Apply filters for food items
      if (userId) {
        foodQuery = foodQuery.eq('user_id', userId);
      }

      if (category && category !== 'cosmetics') {
        foodQuery = foodQuery.eq('category', category);
      }

      // Apply sorting
      foodQuery = foodQuery.order(sortBy, { ascending: sortOrder === 'asc' });

      // Apply limit for food items
      if (limit > 0) {
        foodQuery = foodQuery.limit(Math.floor(limit / 2)); // Split limit between food and cosmetics
      }

      const { data: foodItems, error: foodError } = await foodQuery;

      if (foodError) {
        console.error('Error fetching food items:', foodError);
        throw new Error(`Failed to fetch food items: ${foodError.message}`);
      }

      // Query cosmetics
      console.log('Querying cosmetics...');
      let cosmeticQuery = supabase
        .from('cosmetics')
        .select('id, user_id, name, expiry_date')
        .not('expiry_date', 'is', null)
        .gte('expiry_date', today.toISOString().split('T')[0])
        .lte('expiry_date', futureDate.toISOString().split('T')[0]);

      // Apply filters for cosmetics
      if (userId) {
        cosmeticQuery = cosmeticQuery.eq('user_id', userId);
      }

      if (category === 'cosmetics') {
        cosmeticQuery = cosmeticQuery.eq('status', 'active'); // Only active cosmetics
      }

      // Apply sorting
      cosmeticQuery = cosmeticQuery.order(sortBy === 'expiration_date' ? 'expiry_date' : 'name', { ascending: sortOrder === 'asc' });

      // Apply limit for cosmetics
      if (limit > 0) {
        cosmeticQuery = cosmeticQuery.limit(Math.floor(limit / 2));
      }

      const { data: cosmeticItems, error: cosmeticError } = await cosmeticQuery;

      if (cosmeticError) {
        console.error('Error fetching cosmetics:', cosmeticError);
        throw new Error(`Failed to fetch cosmetics: ${cosmeticError.message}`);
      }

      // Merge food items and cosmetics
      const rawItems: any[] = [];

      if (foodItems) {
        rawItems.push(...foodItems.map(item => ({ ...item, type: 'food' })));
      }

      if (cosmeticItems) {
        rawItems.push(...cosmeticItems.map(item => ({
          id: item.id,
          user_id: item.user_id,
          name: item.name,
          quantity: 1, // Cosmetics default to 1 item
          unit: 'item',
          expiration_date: item.expiry_date,
          category: 'cosmetics',
          image_url: null, // Cosmetics don't have image_url in this query
          type: 'cosmetic'
        })));
      }

      console.log(`Found ${rawItems.length} total items (${foodItems?.length || 0} food, ${cosmeticItems?.length || 0} cosmetics)`);

      if (rawItems.length === 0) {
        console.log('No items found to insert into queue');
        return new Response(JSON.stringify({
          success: true,
          items_inserted: 0,
          message: 'No items found to insert into queue',
          filters_applied: {
            days_ahead: daysAhead,
            user_id: userId,
            category,
            include_expired: includeExpired
          }
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
      }

      // Get unique user_ids from all items
      const userIds = [...new Set(rawItems.map(item => item.user_id))];

      // Query users table to get chat_ids
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, chat_id')
        .in('id', userIds);

      if (usersError) {
        console.error('Error fetching users for queue insertion:', usersError);
        throw new Error(`Failed to fetch users: ${usersError.message}`);
      }

      // Create map of user_id -> chat_id
      const usersMap = new Map(users?.map(user => [user.id, user.chat_id]) || []);

      // Filter items to only include those with chat_id
      const itemsWithChatId = rawItems.filter(item => usersMap.get(item.user_id));

      if (itemsWithChatId.length === 0) {
        console.log('No items with chat_id found');
        return new Response(JSON.stringify({
          success: true,
          items_inserted: 0,
          message: 'No items with chat_id found (users not connected to Telegram)',
          filters_applied: {
            days_ahead: daysAhead,
            user_id: userId,
            category,
            include_expired: includeExpired
          }
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
      }

      // Insert into expiring_items_queue
      const itemsInserted = await insertIntoExpiringQueue(itemsWithChatId, usersMap);

      // Get summary for response
      const summary = {
        urgent: itemsWithChatId.filter(item => getPriority(calculateDaysUntilExpiry(item.expiration_date)) === 'urgent').length,
        high: itemsWithChatId.filter(item => getPriority(calculateDaysUntilExpiry(item.expiration_date)) === 'high').length,
        medium: itemsWithChatId.filter(item => getPriority(calculateDaysUntilExpiry(item.expiration_date)) === 'medium').length,
        low: itemsWithChatId.filter(item => getPriority(calculateDaysUntilExpiry(item.expiration_date)) === 'low').length,
        total: itemsWithChatId.length
      };

      console.log(`POST request completed - inserted ${itemsInserted} items into queue`);

      return new Response(JSON.stringify({
        success: true,
        items_inserted: itemsInserted,
        items_found: rawItems.length,
        items_with_chat_id: itemsWithChatId.length,
        items_without_chat_id: rawItems.length - itemsWithChatId.length,
        breakdown: {
          food_items: foodItems?.length || 0,
          cosmetics: cosmeticItems?.length || 0,
          total: rawItems.length
        },
        summary,
        filters_applied: {
          days_ahead: daysAhead,
          user_id: userId,
          category,
          include_expired: includeExpired
        }
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

  } catch (err) {
    console.error('Unhandled error in check-items-expiring:', err);
    const message = err instanceof Error ? err.message : 'Internal Server Error';

    return new Response(JSON.stringify({
      error: message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  // GET request (check items expiring in next 7 days)
  curl -i --location --request GET 'http://127.0.0.1:54321/functions/v1/check-items-expiring' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

  // GET request with parameters
  curl -i --location --request GET 'http://127.0.0.1:54321/functions/v1/check-items-expiring?days=3&category=dairy&include_expired=true' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

  // POST request with JSON body (inserts items into expiring_items_queue)
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/check-items-expiring' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{
      "days_ahead": 5,
      "category": "meat",
      "include_expired": false,
      "sort_by": "expiration_date",
      "sort_order": "asc",
      "limit": 100
    }'

  // Response example for POST:
  // {
  //   "success": true,
  //   "items_inserted": 3,
  //   "items_found": 5,
  //   "items_with_chat_id": 3,
  //   "items_without_chat_id": 2,
  //   "breakdown": { "food_items": 3, "cosmetics": 2, "total": 5 },
  //   "summary": { "urgent": 1, "high": 1, "medium": 1, "low": 0, "total": 3 }
  // }

*/
