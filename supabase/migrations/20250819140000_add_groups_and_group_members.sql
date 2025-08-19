BEGIN;

-- Groups table to organize users
CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Group members join table
CREATE TABLE IF NOT EXISTS public.group_members (
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members (user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members (group_id);

-- Function to check if two users share at least one group
CREATE OR REPLACE FUNCTION public.is_same_group(user_a uuid, user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm1
    JOIN public.group_members gm2
      ON gm1.group_id = gm2.group_id
    WHERE gm1.user_id = user_a
      AND gm2.user_id = user_b
  );
$$;

-- Ensure function is callable by typical roles
GRANT EXECUTE ON FUNCTION public.is_same_group(uuid, uuid) TO anon, authenticated, service_role;

-- Enable RLS
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for groups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'groups' AND policyname = 'Group members can view their groups'
  ) THEN
    CREATE POLICY "Group members can view their groups" ON public.groups
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = groups.id AND gm.user_id = auth.uid()
        )
        OR created_by = auth.uid()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'groups' AND policyname = 'Users can create groups they own'
  ) THEN
    CREATE POLICY "Users can create groups they own" ON public.groups
      FOR INSERT WITH CHECK (created_by = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'groups' AND policyname = 'Group owners can update'
  ) THEN
    CREATE POLICY "Group owners can update" ON public.groups
      FOR UPDATE USING (created_by = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'groups' AND policyname = 'Group owners can delete'
  ) THEN
    CREATE POLICY "Group owners can delete" ON public.groups
      FOR DELETE USING (created_by = auth.uid());
  END IF;
END
$$;

-- RLS policies for group_members
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'group_members' AND policyname = 'Members can view members of their groups'
  ) THEN
    CREATE POLICY "Members can view members of their groups" ON public.group_members
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'group_members' AND policyname = 'Group owners can manage members'
  ) THEN
    CREATE POLICY "Group owners can manage members" ON public.group_members
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.groups g
          WHERE g.id = group_members.group_id AND g.created_by = auth.uid()
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.groups g
          WHERE g.id = group_members.group_id AND g.created_by = auth.uid()
        )
      );
  END IF;
END
$$;

-- Add group-based read access across user-owned tables
-- Note: We keep existing self-access policies and add group read policies.
DO $$
BEGIN
  -- categories
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categories' AND policyname = 'Group members can view categories'
  ) THEN
    CREATE POLICY "Group members can view categories" ON public.categories
      FOR SELECT USING (public.is_same_group(auth.uid(), user_id));
  END IF;

  -- food_items
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'food_items' AND policyname = 'Group members can view food items'
  ) THEN
    CREATE POLICY "Group members can view food items" ON public.food_items
      FOR SELECT USING (public.is_same_group(auth.uid(), user_id));
  END IF;

  -- meal_plans
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meal_plans' AND policyname = 'Group members can view meal plans'
  ) THEN
    CREATE POLICY "Group members can view meal plans" ON public.meal_plans
      FOR SELECT USING (public.is_same_group(auth.uid(), user_id));
  END IF;

  -- recipes
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recipes' AND policyname = 'Group members can view recipes'
  ) THEN
    CREATE POLICY "Group members can view recipes" ON public.recipes
      FOR SELECT USING (public.is_same_group(auth.uid(), user_id));
  END IF;

  -- shopping_items
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shopping_items' AND policyname = 'Group members can view shopping items'
  ) THEN
    CREATE POLICY "Group members can view shopping items" ON public.shopping_items
      FOR SELECT USING (public.is_same_group(auth.uid(), user_id));
  END IF;

  -- units
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'units' AND policyname = 'Group members can view units'
  ) THEN
    CREATE POLICY "Group members can view units" ON public.units
      FOR SELECT USING (public.is_same_group(auth.uid(), user_id));
  END IF;

  -- user_settings
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_settings' AND policyname = 'Group members can view settings'
  ) THEN
    CREATE POLICY "Group members can view settings" ON public.user_settings
      FOR SELECT USING (public.is_same_group(auth.uid(), user_id));
  END IF;

  -- public.users profile (optional: allow viewing profiles of group members)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Group members can view profiles'
    ) THEN
      CREATE POLICY "Group members can view profiles" ON public.users
        FOR SELECT USING (public.is_same_group(auth.uid(), id));
    END IF;
  END IF;
END
$$;

COMMIT;


