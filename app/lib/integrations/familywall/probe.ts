import { createHash, randomBytes } from 'node:crypto'

export const FAMILYWALL_RESOURCE = 'https://mcp.familywall.com/mcp'
const MAX_RESPONSE = 512 * 1024
const PROTOCOL = '2025-06-18'
type Json = Record<string, unknown>
type Fetcher = typeof fetch

function record(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid FamilyWall response')
  return value as Json
}

function required(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 8192) throw new Error('Invalid FamilyWall metadata')
  return value
}

/** Explicit trust boundary: no redirects, arbitrary URLs or unverified metadata hosts. */
export function trustedEndpoint(value: unknown, origins: readonly string[]): string {
  const url = new URL(required(value))
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !origins.includes(url.origin)) {
    throw new Error('Unapproved FamilyWall OAuth endpoint')
  }
  return url.href
}

async function responseText(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let length = 0
  let result = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_RESPONSE) throw new Error('FamilyWall response too large')
      result += decoder.decode(value, { stream: true })
    }
    return result + decoder.decode()
  } finally { await reader.cancel().catch(() => undefined) }
}

async function request(fetcher: Fetcher, url: string, init: RequestInit = {}) {
  return fetcher(url, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000) })
}
async function json(fetcher: Fetcher, url: string, init: RequestInit = {}) {
  const response = await request(fetcher, url, init)
  if (!response.ok) { await response.body?.cancel(); throw new Error('FamilyWall HTTP ' + response.status) }
  return record(JSON.parse(await responseText(response)))
}

export type ProbeConfig = {
  redirectUri: string
  trustedOrigins: string[]
  clientId?: string
  scope?: string
}
export type PendingProbe = {
  state: string
  verifier: string
  clientId: string
  tokenEndpoint: string
  redirectUri: string
  createdAt: number
}

/** OAuth protected-resource discovery and public client PKCE; no provider credentials handled. */
export async function startFamilyWallProbe(config: ProbeConfig, fetcher: Fetcher = fetch) {
  const resource = new URL(FAMILYWALL_RESOURCE)
  const origins = [...new Set([resource.origin, ...config.trustedOrigins])]
  let protectedResource: Json | undefined
  for (const path of ['/.well-known/oauth-protected-resource' + resource.pathname, '/.well-known/oauth-protected-resource']) {
    const response = await request(fetcher, resource.origin + path)
    if (response.status === 404) { await response.body?.cancel(); continue }
    if (!response.ok) { await response.body?.cancel(); throw new Error('FamilyWall metadata unavailable') }
    protectedResource = record(JSON.parse(await responseText(response)))
    break
  }
  if (!protectedResource || protectedResource.resource !== FAMILYWALL_RESOURCE) throw new Error('FamilyWall resource identity mismatch')
  const servers = protectedResource.authorization_servers
  if (!Array.isArray(servers) || servers.length !== 1) throw new Error('FamilyWall authorization server needs review')
  const issuer = trustedEndpoint(servers[0], origins)
  const issuerUrl = new URL(issuer)
  if (issuerUrl.search) throw new Error('Invalid issuer')
  const suffix = issuerUrl.pathname === '/' ? '' : issuerUrl.pathname
  const metadata = await json(fetcher, issuerUrl.origin + '/.well-known/oauth-authorization-server' + suffix)
  if (metadata.issuer !== servers[0]) throw new Error('FamilyWall issuer mismatch')
  if (!Array.isArray(metadata.code_challenge_methods_supported) || !metadata.code_challenge_methods_supported.includes('S256')) {
    throw new Error('FamilyWall PKCE S256 not advertised')
  }
  const authEndpoint = trustedEndpoint(metadata.authorization_endpoint, origins)
  const tokenEndpoint = trustedEndpoint(metadata.token_endpoint, origins)
  const methods = metadata.token_endpoint_auth_methods_supported
  if (Array.isArray(methods) && !methods.includes('none')) throw new Error('FamilyWall does not advertise public clients')
  let clientId = config.clientId
  if (!clientId) {
    const registration = trustedEndpoint(metadata.registration_endpoint, origins)
    const registered = await json(fetcher, registration, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'RE:MIND (developer test)', redirect_uris: [config.redirectUri],
        grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'none' }),
    })
    if (registered.client_secret || (registered.token_endpoint_auth_method && registered.token_endpoint_auth_method !== 'none')) {
      throw new Error('FamilyWall requires a confidential client; manual setup needed')
    }
    clientId = required(registered.client_id)
  }
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const url = new URL(authEndpoint)
  for (const [key, value] of Object.entries({
    response_type: 'code', client_id: clientId, redirect_uri: config.redirectUri, state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256', resource: FAMILYWALL_RESOURCE,
  })) url.searchParams.set(key, value)
  if (config.scope) url.searchParams.set('scope', config.scope)
  const pending: PendingProbe = { state, verifier, clientId, tokenEndpoint, redirectUri: config.redirectUri, createdAt: Date.now() }
  return { url: url.href, pending }
}

/** The token exists only for this request; never return it to the browser or persist it. */
export async function exchangeProbeCode(pending: PendingProbe, code: string, origins: string[], fetcher: Fetcher = fetch) {
  const tokenEndpoint = trustedEndpoint(pending.tokenEndpoint, [new URL(FAMILYWALL_RESOURCE).origin, ...origins])
  const tokens = await json(fetcher, tokenEndpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: pending.clientId,
      redirect_uri: pending.redirectUri, code_verifier: pending.verifier, resource: FAMILYWALL_RESOURCE }),
  })
  if (String(tokens.token_type).toLowerCase() !== 'bearer') throw new Error('Unsupported FamilyWall token type')
  return required(tokens.access_token)
}

function rpcResult(text: string, contentType: string, id: number): Json {
  const messages = contentType.includes('text/event-stream')
    ? text.split(/\r?\n\r?\n/).flatMap(block => {
      const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
      return data ? [JSON.parse(data)] : []
    })
    : [JSON.parse(text)]
  const result = messages.find(message => message && message.id === id)
  if (!result || result.jsonrpc !== '2.0' || result.error) throw new Error('FamilyWall MCP request failed')
  return record(result.result)
}

export async function discoverFamilyWallTools(accessToken: string, fetcher: Fetcher = fetch) {
  let session: string | null = null
  let protocol = PROTOCOL
  let nextId = 0
  async function rpc(method: string, params: Json, notification = false): Promise<Json> {
    const id = ++nextId
    const headers: Record<string, string> = {
      Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    if (method !== 'initialize') headers['MCP-Protocol-Version'] = protocol
    if (session) headers['Mcp-Session-Id'] = session
    const response = await request(fetcher, FAMILYWALL_RESOURCE, {
      method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', method, params, ...(notification ? {} : { id }) }),
    })
    if (!response.ok) { await response.body?.cancel(); throw new Error('FamilyWall MCP HTTP ' + response.status) }
    if (method === 'initialize') session = response.headers.get('Mcp-Session-Id')
    if (notification) { await response.body?.cancel(); return {} }
    return rpcResult(await responseText(response), response.headers.get('content-type') || '', id)
  }
  try {
    const initialized = await rpc('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'RE:MIND developer probe', version: '0.1.0' } })
    protocol = required(initialized.protocolVersion)
    if (!['2025-06-18', '2025-11-25', '2025-03-26'].includes(protocol)) throw new Error('Unsupported MCP protocol version')
    await rpc('notifications/initialized', {}, true)
    const tools: { name: string; readOnlyHint: boolean; inputSchema: Json }[] = []
    let cursor: string | undefined
    for (let page = 0; page < 5; page++) {
      const result = await rpc('tools/list', cursor ? { cursor } : {})
      if (!Array.isArray(result.tools)) throw new Error('Invalid FamilyWall tool list')
      for (const entry of result.tools) {
        const tool = record(entry)
        const annotations = tool.annotations ? record(tool.annotations) : {}
        tools.push({ name: required(tool.name), readOnlyHint: annotations.readOnlyHint === true, inputSchema: record(tool.inputSchema) })
        if (tools.length > 250) throw new Error('FamilyWall tool list too large')
      }
      if (!result.nextCursor) return tools
      cursor = required(result.nextCursor)
    }
    throw new Error('FamilyWall tool pagination exceeds safe limit')
  } finally {
    if (session) {
      await request(fetcher, FAMILYWALL_RESOURCE, { method: 'DELETE', headers: {
        Authorization: 'Bearer ' + accessToken, 'Mcp-Session-Id': session, 'MCP-Protocol-Version': protocol,
      } }).then(response => response.body?.cancel()).catch(() => undefined)
    }
  }
}
