import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;

// สร้าง Supabase client ธรรมดา (สำหรับการใช้งานทั่วไป)
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

// สร้าง Supabase client ที่มีการยืนยันตัวตน (สำหรับ RLS)
export function getSupabaseWithAuth(token: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY.");
  }

  // สร้าง client ใหม่ทุกครั้งพร้อม Authorization header
  const supabase = createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  return supabase;
}


