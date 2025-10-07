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
  sortBy?: 'expiry_date' | 'name' | 'priority' | 'category';
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

// Main function to check for expiring items
async function checkExpiringItems(options: CheckExpiringItemsOptions = {}): Promise<CheckExpiringItemsResult> {
  const {
    daysAhead = 7,
    userId,
    category,
    includeExpired = false,
    sortBy = 'expiry_date',
    sortOrder = 'asc',
    limit = 1000
  } = options;

  console.log(`Checking for items expiring within ${daysAhead} days`);

  // Calculate date range
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + daysAhead);

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

  const { data: items, error } = await query;

  if (error) {
    console.error('Error fetching expiring items:', error);
    throw new Error(`Failed to fetch expiring items: ${error.message}`);
  }

  if (!items) {
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

  // Process items and calculate additional data
  const processedItems: ExpiringFoodItem[] = items.map(item => {
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

  console.log(`Found ${filteredItems.length} items expiring within ${daysAhead} days`);

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

    const result = await checkExpiringItems(options);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });

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

  // POST request with JSON body
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/check-items-expiring' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{
      "days_ahead": 5,
      "category": "meat",
      "include_expired": false,
      "sort_by": "expiry_date",
      "sort_order": "asc",
      "limit": 100
    }'

*/
