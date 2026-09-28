import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/app/lib/supabase/serviceClient'
import type { PairV2DeliveryRepository, DeliveryOutcome } from './pairingV2Delivery'

function rowOf(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function digest(value: string): string {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('invalid digest')
  return '\\x' + value.toLowerCase()
}

function envelope(value: string): string {
  if (!/^[a-f0-9]{122}$/i.test(value) || value.slice(0, 2).toLowerCase() !== '01') {
    throw new Error('invalid encrypted envelope')
  }
  return '\\x' + value.toLowerCase()
}

function byteaOut(value: unknown, length: number): string | null {
  if (typeof value !== 'string') return null
  const hex = value.startsWith('\\x') ? value.slice(2) : value
  return new RegExp('^[a-f0-9]{' + length * 2 + '}$', 'i').test(hex)
    ? hex.toLowerCase() : null
}

/**
 * Service-only RPC adapter, never imported from a browser or an enabled
 * endpoint today. SQL grants expose only these operations, not private tables.
 * Raw token plaintext and the encryption key never enter RPC parameters.
 */
export function createPairV2DeliveryStore(
  client: SupabaseClient = createServiceClient(),
): PairV2DeliveryRepository {
  return {
    async readDeliveryVerifier(deviceId, sessionId) {
      const { data, error } = await client.rpc('pair_v2_staging_delivery_verifier', {
        p_device_id: deviceId,
        p_session_id: sessionId,
      })
      if (error) throw new Error('delivery verifier unavailable')
      const value = rowOf(data)
      const hash = byteaOut(value?.verifier, 32)
      if (!hash || typeof value?.generation !== 'number') return null
      return { hashHex: hash, generation: value.generation }
    },

    async deliver(input): Promise<DeliveryOutcome> {
      const { data, error } = await client.rpc('pair_v2_staging_deliver', {
        p_device_id: input.deviceId,
        p_session_id: input.sessionId,
        p_generation: input.generation,
        p_expected_verifier: digest(input.expectedVerifierHex),
        p_polling_secret_hash: digest(input.pollingSecretHashHex),
        p_candidate_token_hash: digest(input.candidateTokenHashHex),
        p_candidate_envelope: envelope(input.candidateEnvelopeHex),
      })
      if (error) throw new Error('delivery unavailable')
      const value = rowOf(data)
      const kind = value?.outcome
      if (kind === 'delivered') {
        const envelopeHex = byteaOut(value?.encrypted_payload, 61)
        const tokenHashHex = byteaOut(value?.token_hash, 32)
        if (!envelopeHex || !tokenHashHex) throw new Error('invalid delivery result')
        return { kind, envelopeHex, tokenHashHex }
      }
      if (kind === 'expired' || kind === 'retry_exhausted' || kind === 'unauthorized') {
        return { kind }
      }
      throw new Error('invalid delivery result')
    },

    async acknowledge(input) {
      const { data, error } = await client.rpc('pair_v2_staging_ack', {
        p_device_id: input.deviceId,
        p_session_id: input.sessionId,
        p_generation: input.generation,
        p_expected_verifier: digest(input.expectedVerifierHex),
        p_polling_secret_hash: digest(input.pollingSecretHashHex),
        p_presented_token_hash: digest(input.receivedTokenHashHex),
      })
      if (error) throw new Error('ACK unavailable')
      const value = rowOf(data)?.outcome
      if (value === 'acknowledged' || value === 'already_acknowledged' ||
          value === 'unauthorized') return value
      throw new Error('invalid ACK result')
    },
  }
}
