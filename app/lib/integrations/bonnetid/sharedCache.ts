import { getSupabaseAdmin } from '../spond/server'
import { withSharedIrnCache, type SharedIrnClaim } from './sharedCacheCore.mjs'

// All shared keys and payloads contain provider data only; no user IDs, API
// tokens or personally identifiable settings. Supabase service-role RPC only.
export async function sharedIrnCache<T>(key: string, ttlSeconds: number, load: () => Promise<T[]>): Promise<T[]> {
  const db = getSupabaseAdmin()
  const rpc = async <R>(method: string, args: Record<string, unknown>): Promise<R> => {
    const { data, error } = await db.rpc(method, args)
    if (error) throw new Error('IRN shared cache unavailable: ' + error.code)
    return data as R
  }
  return withSharedIrnCache<T>({
    key,
    ttlSeconds,
    claim: (p_key, p_ttl_seconds) => rpc<SharedIrnClaim<T>>('irn_shared_cache_claim', { p_key, p_ttl_seconds }),
    publish: (p_key, p_token, p_payload) => rpc<boolean>('irn_shared_cache_publish', { p_key, p_token, p_payload }),
    fail: (p_key, p_token) => rpc<boolean>('irn_shared_cache_fail', { p_key, p_token }),
    load,
  })
}
