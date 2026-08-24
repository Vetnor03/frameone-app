import { lookup as nodeLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export function isPrivateRecipeAddress(raw) {
  const address = String(raw).toLowerCase().replace(/^\[|\]$/g, '').replace(/%.+$/, '')
  if (isIP(address) === 4) return /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  if (isIP(address) === 6) return address === '::1' || address === '::' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe8') || address.startsWith('fe9') || address.startsWith('fea') || address.startsWith('feb') || /^::ffff:(7f|a00:|c0a8:|ac1[0-9a-f]:|a9fe:)/.test(address) || address.startsWith('::ffff:127.') || address.startsWith('::ffff:10.') || address.startsWith('::ffff:192.168.')
  return false
}

export function safePublicRecipeUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2_000) return null
  let url
  try { url = new URL(raw) } catch { return null }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || isPrivateRecipeAddress(host)) return null
  return url
}

async function defaultLookup(hostname) {
  return nodeLookup(hostname, { all: true, verbatim: true })
}

export async function assertPublicRecipeHost(url, lookup = defaultLookup) {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) {
    if (isPrivateRecipeAddress(host)) throw new Error('unsafe_address')
    return
  }
  const resolved = await lookup(host)
  const addresses = Array.isArray(resolved) ? resolved : [resolved]
  if (!addresses.length || addresses.some((entry) => !entry?.address || isPrivateRecipeAddress(entry.address))) throw new Error('unsafe_address')
}

export async function fetchPublicRecipePage(initialUrl, fetcher = fetch, options = {}, lookup = defaultLookup) {
  let url = safePublicRecipeUrl(String(initialUrl))
  if (!url) throw new Error('unsafe_url')
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    await assertPublicRecipeHost(url, lookup)
    const response = await fetcher(url, { ...options, redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    url = location ? safePublicRecipeUrl(new URL(location, url).toString()) : null
    if (!url) throw new Error('unsafe_redirect')
  }
  throw new Error('too_many_redirects')
}
