import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/app/lib/supabase/serviceClient'
import type { PairV2StartRepository, OpenSessionInput, OpenSessionOutcome } from './pairingV2Start'

type RecordValue = Record<string, unknown>

function asRow(data: unknown): RecordValue | null {
  const row = Array.isArray(data) ? data[0] : data
  return row && typeof row === 'object' && !Array.isArray(row)
    ? row as RecordValue
    : null
}

function bytea(hex: string): string {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('invalid verifier format')
  return '\\x' + hex
}

/**
 * Only to be constructed inside a future staging-gated server route. Service
 * key never leaves the server. Both RPCs are denied to anon/authenticated;
 * private tables are NOT granted to service_role for ordinary Data API reads.
 */
export function createPairV2StartStore(
  client: SupabaseClient = createServiceClient(),
): PairV2StartRepository {
  return {
    async readEligibleVerifier(deviceId) {
      const { data, error } = await client.rpc('pair_v2_staging_verifier', {
        p_device_id: deviceId,
      })
      if (error) throw new Error('verifier lookup unavailable')
      const row = asRow(data)
      if (!row || typeof row.verifier !== 'string' ||
          typeof row.generation !== 'number') return null
      return { hashHex: row.verifier, generation: row.generation }
    },

    async openSession(input: OpenSessionInput): Promise<OpenSessionOutcome> {
      const { data, error } = await client.rpc('pair_v2_staging_start', {
        p_device_id: input.deviceId,
        p_generation: input.generation,
        p_expected_verifier: bytea(input.expectedVerifierHex),
        p_display_code_mac: bytea(input.displayCodeMacHex),
        p_polling_secret_hash: bytea(input.pollingSecretHashHex),
      })
      if (error) throw new Error('session insert unavailable')
      const row = asRow(data)
      if (!row || typeof row.outcome !== 'string') throw new Error('invalid session result')
      if (row.outcome === 'created' && typeof row.session_id === 'string') {
        return { kind: 'created', sessionId: row.session_id }
      }
      if (row.outcome === 'collision' || row.outcome === 'already_active' ||
          row.outcome === 'ineligible') {
        return { kind: row.outcome }
      }
      throw new Error('invalid session result')
    },
  }
}
