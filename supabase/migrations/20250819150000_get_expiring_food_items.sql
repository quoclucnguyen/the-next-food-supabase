BEGIN;

-- Returns the caller's food items that expire within the next N days (default 7), inclusive of today
CREATE OR REPLACE FUNCTION public.get_food_items_expiring_soon(days_ahead integer DEFAULT 7)
RETURNS SETOF public.food_items
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT fi.*
  FROM public.food_items fi
  WHERE fi.user_id = auth.uid()
    AND fi.expiration_date >= current_date
    AND fi.expiration_date <= current_date + GREATEST(days_ahead, 0)
  ORDER BY fi.expiration_date ASC, fi.name ASC;
$$;

-- Allow clients to call via RPC
GRANT EXECUTE ON FUNCTION public.get_food_items_expiring_soon(integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_food_items_expiring_soon(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_food_items_expiring_soon(integer) TO service_role;

COMMIT;


