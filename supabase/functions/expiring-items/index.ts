import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// CORS helper
function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  } as Record<string, string>;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
}

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

    // Parse and clamp days parameter
    const daysParam = url.searchParams.get('days') ?? '7';
    let daysAhead = Number(daysParam);
    if (!Number.isFinite(daysAhead) || daysAhead < 0) daysAhead = 7;
    if (daysAhead > 365) daysAhead = 365; // hard cap to prevent abuse

    // Forward caller's auth to respect RLS
    const authHeader = headers.get('Authorization') ?? '';

    const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Prefer RPC to leverage the SQL function and any future optimizations
    const { data, error } = await supabase.rpc('get_food_items_expiring_soon', {
      days_ahead: daysAhead,
    });

    if (error) {
      console.error('RPC error:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
      );
    }

    return new Response(JSON.stringify({ items: data, days_ahead: daysAhead }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (err) {
    console.error('Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(null) },
    });
  }
});


