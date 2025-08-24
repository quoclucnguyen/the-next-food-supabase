import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// CORS helper
function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

// HTTP server
Deno.serve(async (req) => {
  const { method, headers } = req;
  const origin = headers.get('Origin');

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(origin) });
  }

  if (method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint') || 'queue'; // Default to queue, or 'items' for legacy

    if (endpoint === 'queue') {
      // Query the notification queue
      const status = url.searchParams.get('status') || 'pending'; // pending, processing, sent, failed
      const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 1000); // Cap at 1000

      const { data: queueData, error: queueError } = await supabase
        .from('expiring_items_queue')
        .select(`
          id,
          food_item_id,
          user_id,
          chat_id,
          item_name,
          quantity,
          unit,
          expiration_date,
          category,
          days_until_expiry,
          notification_priority,
          scheduled_at,
          status,
          processed_at,
          created_at,
          updated_at
        `)
        .eq('status', status)
        .order('notification_priority', { ascending: false })
        .order('scheduled_at', { ascending: true })
        .limit(limit);

      if (queueError) {
        console.error('Queue query error:', queueError);
        return new Response(
          JSON.stringify({ error: queueError.message }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
        );
      }

      // Get queue statistics using RPC function (since groupBy might not be available)
      const { data: statsData, error: statsError } = await supabase
        .rpc('get_queue_stats');

      const stats: { [key: string]: number } = {};
      if (!statsError && statsData) {
        statsData.forEach((row: any) => {
          stats[row.status as string] = parseInt(row.count);
        });
      }

      return new Response(JSON.stringify({
        queue_items: queueData,
        stats: stats,
        total_count: queueData?.length || 0
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });

    } else {
      // Legacy endpoint - query food items expiring within the specified days ahead
      const daysParam = url.searchParams.get('days') ?? '7';
      let daysAhead = Number(daysParam);
      if (!Number.isFinite(daysAhead) || daysAhead < 0) daysAhead = 7;
      if (daysAhead > 365) daysAhead = 365; // hard cap to prevent abuse

      const { data, error } = await supabase
        .from('food_items')
        .select('id, name, quantity, unit, expiration_date, category, image_url')
        .gte('expiration_date', new Date().toISOString().split('T')[0])
        .lte('expiration_date', new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('expiration_date', { ascending: true })
        .order('name', { ascending: true });

      if (error) {
        console.error('Query error:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
        );
      }

      return new Response(JSON.stringify({ items: data, days_ahead: daysAhead }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }
  } catch (err) {
    console.error('Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(null) },
    });
  }
});


