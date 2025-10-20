import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY.");
  }

  if (!supabaseClient) {
    supabaseClient = createClient(url, anonKey);
  }

  return supabaseClient;
}


