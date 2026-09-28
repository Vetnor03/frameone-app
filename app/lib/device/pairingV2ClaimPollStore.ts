import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/app/lib/supabase/serviceClient'
import type {
  PairV2ClaimPollRepository, ClaimOutcome, PollOutcome,
} from './pairingV2ClaimPoll'

function one(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data
  return row && typeof row === 'object' && !Array.isArray(row)
    ? row as Record<string, unknown>
    : null
}

function digest(hex: string): string {
  if (!/^[a-f0-9]{64}$/i.test(hex)) throw new Error('invalid digest')
  return '\\x' + hex.toLowerCase()
}

export function createPairV2ClaimPollStore(
  client: SupabaseClient = createServiceClient(),
): PairV2ClaimPollRepository {
  return {
    async claim(args) {
      const { data, error } = await client.rpc('pair_v2_staging_claim', {
        p_user_id: args.verifiedUserId,
        p_code_mac: digest(args.codeMacHex),
        p_account_mac: digest(args.accountMacHex),
        p_network_mac: digest(args.networkMacHex),
      })
      if (error) throw new Error('claim unavailable')
      const value = one(data)?.outcome
      if (value === 'claimed' || value === 'invalid' || value === 'rate_limited') {
        return value as ClaimOutcome
      }
      throw new Error('unexpected claim outcome')
    },

    async readPollVerifier(deviceId, sessionId) {
      const { data, error } = await client.rpc('pair_v2_staging_poll_verifier', {
        p_device_id: deviceId,
        p_session_id: sessionId,
      })
      if (error) throw new Error('poll verifier unavailable')
      const row = one(data)
      if (!row || typeof row.verifier !== 'string' ||
          typeof row.generation !== 'number') return null
      return { hashHex: row.verifier, generation: row.generation }
    },

    async poll(args) {
      const { data, error } = await client.rpc('pair_v2_staging_poll', {
        p_device_id: args.deviceId,
        p_session_id: args.sessionId,
        p_generation: args.generation,
        p_expected_verifier: digest(args.expectedVerifierHex),
        p_polling_secret_hash: digest(args.pollingSecretHashHex),
      })
      if (error) throw new Error('poll unavailable')
      const value = one(data)?.outcome
      if (value === 'pending' || value === 'claimed' ||
          value === 'expired' || value === 'unauthorized') {
        return value as PollOutcome
      }
      throw new Error('unexpected poll outcome')
    },
  }
}
