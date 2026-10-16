import { createHmac } from 'node:crypto'
import { pilotRevisionTopic } from './mqttPilotPublish.ts'

/**
 * Managed EMQX Dedicated v5 provisioning. EMQX Serverless does NOT expose
 * documented authentication-user and ACL administration through its Broker
 * Deployment API. Never attempt this workflow on a Serverless deployment.
 *
 * No secrets or broker administrator credentials are returned to the frame.
 * Fail closed: no MQTT credentials are issued until an account with the
 * expected derived password and a restricted authorization rule is installed
 * and verified. HTTPS frame updates continue if this setup fails.
 */
export type FleetProvisionConfig = {
  provider?: string
  managementUrl?: string
  apiKey?: string
  apiSecret?: string
  derivationSecret?: string
}
export type ProvisionResult =
  | { ok: true; username: string; password: string }
  | { ok: false; reason: 'configuration' | 'broker_unavailable' | 'broker_unsupported' | 'authorization' }

const PREFIX = 'rmd_' // Reserved for automatically provisioned RE:MIND MQTT users.

export function deriveFrameMqttUsername(deviceId: string): string | null {
  return pilotRevisionTopic(deviceId) ? PREFIX + deviceId : null
}

export function deriveFrameMqttPassword(deviceId: string, secret: string): string | null {
  if (!deriveFrameMqttUsername(deviceId) || secret.length < 43) return null
  return createHmac('sha256', secret)
    .update('RE:MIND MQTT authentication v2\0')
    .update(deviceId)
    .digest('base64url')
}

function managementOrigin(value: string): URL | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.search || url.hash || !['/api/v5', '/api/v5/'].includes(url.pathname)) return null
    return url
  } catch {
    return null
  }
}

// Defensively compare an existing rule without broadening permissions.
// A user must have exactly one subscribe-only rule on its own topic; a
// global 'all users deny #' is still required to deny unmatched operations.
export function exactDeviceRule(value: unknown, username: string, deviceId: string): boolean {
  if (!value || typeof value !== 'object') return false
  const body = value as { username?: unknown; rules?: unknown }
  if (body.username !== username || !Array.isArray(body.rules) || body.rules.length !== 1) return false
  const rule = body.rules[0]
  if (!rule || typeof rule !== 'object') return false
  const r = rule as Record<string, unknown>
  const topic = pilotRevisionTopic(deviceId)
  const keys = Object.keys(r)
  return r.topic === topic && r.action === 'subscribe' && r.permission === 'allow' &&
    keys.every(key => ['topic', 'action', 'permission'].includes(key))
}

export async function provisionFrameMqtt(
  deviceId: string,
  config: FleetProvisionConfig = {
    provider: process.env.MQTT_FLEET_PROVIDER,
    managementUrl: process.env.MQTT_FLEET_MANAGEMENT_URL,
    apiKey: process.env.MQTT_FLEET_API_KEY,
    apiSecret: process.env.MQTT_FLEET_API_SECRET,
    derivationSecret: process.env.MQTT_FLEET_DERIVATION_SECRET,
  },
  request: typeof fetch = fetch,
): Promise<ProvisionResult> {
  // Require a specific, compatible broker type. Do not accidentally use the
  // pilot Serverless management endpoint for credential administration.
  if (config.provider !== 'emqx_dedicated_v5') return { ok: false, reason: 'broker_unsupported' }

  const username = deriveFrameMqttUsername(deviceId)
  const password = deriveFrameMqttPassword(deviceId, config.derivationSecret ?? '')
  const api = managementOrigin(config.managementUrl ?? '')
  if (!username || !password || !api || !config.apiKey || !config.apiSecret) {
    return { ok: false, reason: 'configuration' }
  }

  const authorization = 'Basic ' + Buffer.from(config.apiKey + ':' + config.apiSecret).toString('base64')
  type Verb = 'GET' | 'POST' | 'PUT'
  async function brokerRequest(path: string, method: Verb, body?: object): Promise<Response | null> {
    const url = new URL('/api/v5/' + path, api!.origin)
    try {
      return await request(url.toString(), {
        method,
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(4500),
        headers: { authorization, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch {
      return null
    }
  }

  const userBase = 'authentication/password_based%3Abuilt_in_database/users'
  const aclBase = 'authorization/sources/built_in_database/rules/users'
  const userPath = userBase + '/' + encodeURIComponent(username)
  const aclPath = aclBase + '/' + encodeURIComponent(username)

  // Read before writing; do not trust an unexpected existing account.
  const user = await brokerRequest(userPath, 'GET')
  if (!user) return { ok: false, reason: 'broker_unavailable' }
  if (user.status === 404) {
    const created = await brokerRequest(userBase, 'POST', {
      user_id: username, password, is_superuser: false,
    })
    if (!created) return { ok: false, reason: 'broker_unavailable' }
    if ([404, 405, 501].includes(created.status)) return { ok: false, reason: 'broker_unsupported' }
    if (created.status !== 201 && created.status !== 409) {
      return { ok: false, reason: 'broker_unavailable' }
    }
  } else if (!user.ok) {
    return { ok: false, reason: [405, 501].includes(user.status) ? 'broker_unsupported' : 'broker_unavailable' }
  }

  // Confirm identity and non-superuser status even after concurrent creation.
  const verifyUser = await brokerRequest(userPath, 'GET')
  if (!verifyUser?.ok) return { ok: false, reason: 'broker_unavailable' }
  const parsedUser = await verifyUser.json().catch(() => null) as
    | { user_id?: string; is_superuser?: boolean } | null
  if (!parsedUser || parsedUser.user_id !== username || parsedUser.is_superuser === true) {
    return { ok: false, reason: 'authorization' }
  }

  // PUT the deterministic password to recover a drifted account: idempotent
  // and consistent across stateless Vercel instances. Username is reserved,
  // so this cannot overwrite the original manually provisioned prototype.
  const refreshed = await brokerRequest(userPath, 'PUT', {
    password, is_superuser: false,
  })
  if (!refreshed?.ok) return { ok: false, reason: 'broker_unavailable' }

  const acl = await brokerRequest(aclPath, 'GET')
  if (!acl) return { ok: false, reason: 'broker_unavailable' }
  const desired = {
    username,
    rules: [{ topic: pilotRevisionTopic(deviceId), action: 'subscribe', permission: 'allow' }],
  }
  if (acl.status === 404) {
    const created = await brokerRequest(aclBase, 'POST', [desired])
    if (!created) return { ok: false, reason: 'broker_unavailable' }
    // EMQX's documented success for POST rules is 204, not 201.
    if (created.status !== 204 && created.status !== 409) {
      return { ok: false, reason: [404, 405, 501].includes(created.status) ? 'broker_unsupported' : 'authorization' }
    }
  } else if (!acl.ok) {
    return { ok: false, reason: 'authorization' }
  }

  // Username-specific rules take priority, but EMQX may otherwise allow
  // unmatched subscriptions by default. Require a broker-wide deny-all
  // fallback before giving any new frame its MQTT password.
  const globalAcl = await brokerRequest('authorization/sources/built_in_database/rules/all', 'GET')
  if (!globalAcl?.ok) return { ok: false, reason: 'authorization' }
  const globalData = await globalAcl.json().catch(() => null) as
    | { rules?: { topic?: unknown; action?: unknown; permission?: unknown }[] } | null
  if (!Array.isArray(globalData?.rules) || !globalData.rules.some(rule =>
    rule.topic === '#' && rule.action === 'all' && rule.permission === 'deny')) {
    return { ok: false, reason: 'authorization' }
  }

  // Always check broker's actual permissions before ever returning password.
  const checked = await brokerRequest(aclPath, 'GET')
  if (!checked?.ok) return { ok: false, reason: 'authorization' }
  const rules = await checked.json().catch(() => null)
  if (!exactDeviceRule(rules, username, deviceId)) return { ok: false, reason: 'authorization' }

  return { ok: true, username, password }
}
