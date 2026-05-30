import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'

export async function createUserServerClient(): Promise<{ supabase: SupabaseClient; user: User | null; authError: string | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase public environment variables')
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
      },
    },
  })

  const { data, error } = await supabase.auth.getUser()
  return { supabase, user: data.user, authError: error?.message ?? null }
}
