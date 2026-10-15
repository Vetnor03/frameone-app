import { createHmac } from 'node:crypto'
import { pilotRevisionTopic } from './mqttPilotPublish'

/**
 * Future fleet onboarding on compatible EMQX broker management APIs.
 * Fail closed if provisioning or per-user subscribe-only ACL fails.
 * Keep fleet switch DISABLED until API availability and physical device
 * connection/ACL tests are verified on the deployed EMQX tier.
 *
 * A separate secret (NOT the EMQX API secret or the pilot frame password)
 * gives each frame a unique deterministic credential without storing
 * thousands of plaintext MQTT passwords or embedding a fleet secret in FW.
 */
export type FleetProvisionConfig = {
  serverUrl?: string
  apiKey?: string
  apiSecret?: string
  derivationSecret?: string
}

export function deriveFrameMqttPassword(deviceId: string, derivationSecret: string): string | null {
  if (!pilotRevisionTopic(deviceId) || derivationSecret.length < 43) return null
  return createHmac('sha256', derivationSecret)
    .update('RE:MIND MQTT authentication v1\0')
    .update(deviceId)
    .digest('base64url')
}

export type ProvisionResult =
  | { ok: true; username: string; password: string }
  | { ok: false; reason: 'configuration' | 'broker_unavailable' | 'broker_unsupported' | 'authorization' }

function brokerUrl(base: string): URL | null {
  try {
    const url = new URL(base)
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.search || url.hash || url.pathname !== '/api/v5/publish') return null
    return url
  } catch {
    return null
  }
}

export async function provisionFrameMqtt(
  deviceId: string,
  config: FleetProvisionConfig = {
    serverUrl: process.env.MQTT_PILOT_EMQX_PUBLISH_URL,
    apiKey: process.env.MQTT_PILOT_EMQX_API_KEY,
    apiSecret: process.env.MQTT_PILOT_EMQX_API_SECRET,
    derivationSecret: process.env.MQTT_FLEET_DERIVATION_SECRET,
  },
  request: typeof fetch = fetch,
): Promise<ProvisionResult> {
  const password = deriveFrameMqttPassword(deviceId, config.derivationSecret ?? '')
  const api = brokerUrl(config.serverUrl ?? '')
  if (!password || !api || !config.apiKey || !config.apiSecret) {
    return { ok: false, reason: 'configuration' }
  }

  const authorization = 'Basic ' +
    Buffer.from(config.apiKey + ':' + config.apiSecret).toString('base64')

  async function brokerRequest(path: string, method: 'GET' | 'POST' | 'PUT', body?: object): Promise<Response | null> {
    const u = new URL(path, api!.origin)
    try {
      return await request(u.toString(), {
        method,
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(4500),
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch {
      return null
    }
  }

  const userBase = '/api/v5/authentication/password_based%3Abuilt_in_database/users'
  const aclBase = '/api/v5/authorization/sources/built_in_database/rules/users'
  const id = encodeURIComponent(deviceId)
  const user = await brokerRequest(userBase + '/' + id, 'GET')
  if (!user) return { ok: false, reason: 'broker_unavailable' }
  if (user.status === 404) {
    const created = await brokerRequest(userBase, 'POST', {
      user_id: deviceId, password, is_superuser: false,
    })
    // Another request may have created the exact same account concurrently.
    if (!created) return { ok: false, reason: 'broker_unavailable' }
    if (created.status === 404 || created.status === 405 || created.status === 501) {
      return { ok: false, reason: 'broker_unsupported' }
    }
    if (created.status !== 201 && created.status !== 200 && created.status !== 409) {
      return { ok: false, reason: 'broker_unavailable' }
    }
  } else if (!user.ok) {
    return { ok: false, reason: [405, 501].includes(user.status) ? 'broker_unsupported' : 'broker_unavailable' }
  }

  // Avoid accidentally enabling broad cross-device subscriptions.
  // Replacing one username's rules with one exact subscribe-only rule makes
  // the ACL independent of other accounts and the global deny-all fallback.
  const aclPayload = {
    username: deviceId,
    rules: [{ topic: pilotRevisionTopic(deviceId), action: 'subscribe', permission: 'allow' }],
  }
  const existingAcl = await brokerRequest(aclBase + '/' + id, 'GET')
  if (!existingAcl) return { ok: false, reason: 'broker_unavailable' }

  if (existingAcl.status === 404) {
    const created = await brokerRequest(aclBase, 'POST', [aclPayload])
    if (!created) return { ok: false, reason: 'broker_unavailable' }
    if (created.status === 409) {
      const updated = await brokerRequest(aclBase + '/' + id, 'PUT', aclPayload)
      if (!updated?.ok) return { ok: false, reason: 'authorization' }
    } else if (![200, 201, 204].includes(created.status)) {
      return { ok: false, reason: 'authorization' }
    }
  } else if (existingAcl.ok) {
    // Existing ACL is accepted only when it already has the exact restriction.
    // Never silently overwrite a different account's rules.
    const acl = await existingAcl.json().catch(() => null) as
      | { rules?: { topic?: string; action?: string; permission?: string }[] } | null
    const rules = acl?.rules
    if (!Array.isArray(rules) || rules.length !== 1 ||
        rules[0].topic !== pilotRevisionTopic(deviceId) ||
        rules[0].action !== 'subscribe' || rules[0].permission !== 'allow') {
      return { ok: false, reason: 'authorization' }
    }
  } else {
    return { ok: false, reason: 'authorization' }
  }
  return { ok: true, username: deviceId, password }
}
