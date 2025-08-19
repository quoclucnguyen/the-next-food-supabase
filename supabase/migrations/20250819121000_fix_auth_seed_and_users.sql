BEGIN;

-- Ensure the seed function runs with privileges that bypass RLS
CREATE OR REPLACE FUNCTION public.seed_default_categories_units()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Insert default categories
  INSERT INTO categories (user_id, name, display_name) VALUES
    (NEW.id, 'fruits', 'Fruits'),
    (NEW.id, 'vegetables', 'Vegetables'),
    (NEW.id, 'dairy', 'Dairy'),
    (NEW.id, 'meat', 'Meat'),
    (NEW.id, 'grains', 'Grains'),
    (NEW.id, 'pantry', 'Pantry'),
    (NEW.id, 'frozen', 'Frozen'),
    (NEW.id, 'beverages', 'Beverages'),
    (NEW.id, 'snacks', 'Snacks'),
    (NEW.id, 'other', 'Other');

  -- Insert default units
  INSERT INTO units (user_id, name, display_name) VALUES
    (NEW.id, 'pieces', 'Pieces'),
    (NEW.id, 'lbs', 'Lbs'),
    (NEW.id, 'oz', 'Oz'),
    (NEW.id, 'kg', 'Kg'),
    (NEW.id, 'g', 'G'),
    (NEW.id, 'cups', 'Cups'),
    (NEW.id, 'liters', 'Liters'),
    (NEW.id, 'ml', 'Ml'),
    (NEW.id, 'cans', 'Cans'),
    (NEW.id, 'bottles', 'Bottles'),
    (NEW.id, 'packages', 'Packages');

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.seed_default_categories_units() OWNER TO postgres;

-- Create the public.users table used by the Telegram bot (if missing)
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_id bigint UNIQUE,
  email text,
  first_name text,
  last_name text,
  username text,
  last_login timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS and add policies for self-access
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users can view their own profile'
  ) THEN
    CREATE POLICY "Users can view their own profile" ON public.users
      FOR SELECT USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users can insert their own profile'
  ) THEN
    CREATE POLICY "Users can insert their own profile" ON public.users
      FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users can update their own profile'
  ) THEN
    CREATE POLICY "Users can update their own profile" ON public.users
      FOR UPDATE USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users can delete their own profile'
  ) THEN
    CREATE POLICY "Users can delete their own profile" ON public.users
      FOR DELETE USING (auth.uid() = id);
  END IF;
END
$$;

COMMIT;


