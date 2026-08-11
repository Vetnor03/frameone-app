import type { SupabaseClient } from '@supabase/supabase-js'

export const DEVICE_ACTIVITY_HEARTBEAT_MS = 45_000
export const DEVICE_UPDATE_POLL_MS = 1_000
export const DEVICE_UPDATE_TIMEOUT_MS = 3 * 60_000
export const DEVICE_UPDATE_UNCONFIRMED_POLL_MS = 15_000

async function accessToken(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('missing_auth_token')
  return token
}

async function authenticatedFetch(
  supabase: SupabaseClient,
  input: string,
  init?: RequestInit
) {
  const token = await accessToken(supabase)
  return fetch(input, {
    ...init,
    cache: 'no-store',
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function sendDeviceActivity(supabase: SupabaseClient, deviceId: string) {
  const response = await authenticatedFetch(supabase, '/api/device/update-state/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  })
  if (!response.ok) throw new Error('activity_failed')
}

export async function requestDeviceUpdate(supabase: SupabaseClient, deviceId: string, requestId: string) {
  const response = await authenticatedFetch(supabase, '/api/device/update-state/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId, request_id: requestId }),
  })
  const body = await response.json().catch(() => null)
  const revision = Number(body?.requested_revision)
  if (!response.ok || !Number.isSafeInteger(revision) || revision < 0) throw new Error('update_request_failed')
  return revision
}

export async function getDeviceUpdateStatus(supabase: SupabaseClient, deviceId: string) {
  const response = await authenticatedFetch(
    supabase,
    `/api/device/update-state/status?device_id=${encodeURIComponent(deviceId)}`
  )
  const body = await response.json().catch(() => null)
  const requestedRevision = Number(body?.requested_revision)
  const displayedRevision = Number(body?.displayed_revision)
  if (!response.ok || !Number.isSafeInteger(requestedRevision) || requestedRevision < 0 || !Number.isSafeInteger(displayedRevision) || displayedRevision < 0) {
    throw new Error('update_status_failed')
  }
  return {
    requestedRevision,
    requestedAt: typeof body?.requested_at === 'string' ? body.requested_at : null,
    displayedRevision,
    lastProbeAt: typeof body?.last_probe_at === 'string' ? body.last_probe_at : null,
  }
}

export function revisionHasBeenDisplayed(displayedRevision: number, requestedRevision: number) {
  return displayedRevision >= requestedRevision
}
