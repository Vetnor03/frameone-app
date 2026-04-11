// app/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

let _client: SupabaseClient | null = null

function getBrowserClient(): SupabaseClient {
  if (_client) return _client

  _client = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // You can keep these; createBrowserClient will manage cookie sync.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })

  return _client
}

// ✅ Keep the same exported name you already use across the app.
export const supabase = getBrowserClient()
