

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."seed_default_categories_units"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."seed_default_categories_units"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_settings_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."categories" IS 'User-specific food categories for organizing inventory items';



COMMENT ON COLUMN "public"."categories"."name" IS 'Internal name used in code (lowercase, no spaces)';



COMMENT ON COLUMN "public"."categories"."display_name" IS 'Human-readable name shown in UI';



CREATE TABLE IF NOT EXISTS "public"."food_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "expiration_date" "date" NOT NULL,
    "category" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "image_url" "text"
);


ALTER TABLE "public"."food_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meal_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "date" "date" NOT NULL,
    "meal_type" "text" NOT NULL,
    "recipe_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "meal_plans_meal_type_check" CHECK (("meal_type" = ANY (ARRAY['breakfast'::"text", 'lunch'::"text", 'dinner'::"text"])))
);


ALTER TABLE "public"."meal_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "ingredients" "text"[] NOT NULL,
    "instructions" "text"[] NOT NULL,
    "prep_time" integer NOT NULL,
    "servings" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "image_url" "text"
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shopping_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "category" "text" NOT NULL,
    "completed" boolean DEFAULT false,
    "source" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "shopping_items_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'meal-plan'::"text", 'inventory'::"text"])))
);


ALTER TABLE "public"."shopping_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."units" OWNER TO "postgres";


COMMENT ON TABLE "public"."units" IS 'User-specific measurement units for inventory items';



COMMENT ON COLUMN "public"."units"."name" IS 'Internal name used in code (lowercase, no spaces)';



COMMENT ON COLUMN "public"."units"."display_name" IS 'Human-readable name shown in UI';



CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "preferences" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "gemini_api_key" "text"
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_settings" IS 'User settings including API keys and preferences';



COMMENT ON COLUMN "public"."user_settings"."gemini_api_key" IS 'Gemini API key stored in plain text';



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."food_items"
    ADD CONSTRAINT "food_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_plans"
    ADD CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_plans"
    ADD CONSTRAINT "meal_plans_user_id_date_meal_type_key" UNIQUE ("user_id", "date", "meal_type");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shopping_items"
    ADD CONSTRAINT "shopping_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_key" UNIQUE ("user_id");



CREATE INDEX "idx_categories_name" ON "public"."categories" USING "btree" ("user_id", "name");



CREATE INDEX "idx_categories_user_id" ON "public"."categories" USING "btree" ("user_id");



CREATE INDEX "idx_food_items_expiration" ON "public"."food_items" USING "btree" ("expiration_date");



CREATE INDEX "idx_food_items_user_id" ON "public"."food_items" USING "btree" ("user_id");



CREATE INDEX "idx_meal_plans_date" ON "public"."meal_plans" USING "btree" ("date");



CREATE INDEX "idx_meal_plans_user_id" ON "public"."meal_plans" USING "btree" ("user_id");



CREATE INDEX "idx_recipes_user_id" ON "public"."recipes" USING "btree" ("user_id");



CREATE INDEX "idx_shopping_items_user_id" ON "public"."shopping_items" USING "btree" ("user_id");



CREATE INDEX "idx_units_name" ON "public"."units" USING "btree" ("user_id", "name");



CREATE INDEX "idx_units_user_id" ON "public"."units" USING "btree" ("user_id");



CREATE INDEX "idx_user_settings_user_id" ON "public"."user_settings" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "trigger_update_user_settings_updated_at" BEFORE UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_settings_updated_at"();



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_items"
    ADD CONSTRAINT "food_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plans"
    ADD CONSTRAINT "meal_plans_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plans"
    ADD CONSTRAINT "meal_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shopping_items"
    ADD CONSTRAINT "shopping_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can delete their own categories" ON "public"."categories" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own food items" ON "public"."food_items" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own meal plans" ON "public"."meal_plans" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own recipes" ON "public"."recipes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own settings" ON "public"."user_settings" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own shopping items" ON "public"."shopping_items" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own units" ON "public"."units" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own categories" ON "public"."categories" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own food items" ON "public"."food_items" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own meal plans" ON "public"."meal_plans" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own recipes" ON "public"."recipes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own settings" ON "public"."user_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own shopping items" ON "public"."shopping_items" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own units" ON "public"."units" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own categories" ON "public"."categories" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own food items" ON "public"."food_items" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own meal plans" ON "public"."meal_plans" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own recipes" ON "public"."recipes" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own settings" ON "public"."user_settings" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own shopping items" ON "public"."shopping_items" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own units" ON "public"."units" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own categories" ON "public"."categories" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own food items" ON "public"."food_items" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own meal plans" ON "public"."meal_plans" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own recipes" ON "public"."recipes" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own settings" ON "public"."user_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own shopping items" ON "public"."shopping_items" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own units" ON "public"."units" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shopping_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."units" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."seed_default_categories_units"() TO "anon";
GRANT ALL ON FUNCTION "public"."seed_default_categories_units"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_default_categories_units"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_settings_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."food_items" TO "anon";
GRANT ALL ON TABLE "public"."food_items" TO "authenticated";
GRANT ALL ON TABLE "public"."food_items" TO "service_role";



GRANT ALL ON TABLE "public"."meal_plans" TO "anon";
GRANT ALL ON TABLE "public"."meal_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_plans" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT ALL ON TABLE "public"."shopping_items" TO "anon";
GRANT ALL ON TABLE "public"."shopping_items" TO "authenticated";
GRANT ALL ON TABLE "public"."shopping_items" TO "service_role";



GRANT ALL ON TABLE "public"."units" TO "anon";
GRANT ALL ON TABLE "public"."units" TO "authenticated";
GRANT ALL ON TABLE "public"."units" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























RESET ALL;
