import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Same client, without the generated table types — for tables/columns added
// after src/integrations/supabase/types.ts was last regenerated
// (categories.delivery_weekdays, delivery_date_overrides).
export const untypedSupabase = supabase as unknown as SupabaseClient;
