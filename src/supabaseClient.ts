import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://bvibbwairbpjghdjzyyd.supabase.co";

const supabaseAnonKey = "sb_publishable_NAKcWrNDn9Ba0hnBUvMepA_NR70Aref";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
