import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'

const MAX_RESPONSE_BYTES = 1024 * 1024
const REQUEST_TIMEOUT_MS = 8000
const MAX_REDIRECTS = 3

// Deliberately support only public DNS names with public IPv4 answers in this
// pilot. Do not make a best-effort request if we cannot safely pin an address.
export function isPublicIpv4(address) {
  if (isIP(address) !== 4) return false
  const [a, b, c] = address.split('.').map(Number)
  if (a < 1 || a >= 224) return false
  if (a === 10 || a === 127 || a === 0) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) return false
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false
  if (a === 203 && b === 0 && c === 113) return false
  if (a === 192 && b === 0 && c === 0) return false
  return true
}

export function normalizeCalendarUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 2048) throw new Error('Enter a valid calendar link')
  const input = raw.trim().replace(/^webcals?:\/\//i, 'https://')
  let url
  try { url = new URL(input) } catch { throw new Error('Enter a valid calendar link') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) {
    throw new Error('Calendar links must use HTTPS without a username, password or port')
  }
  const hostname = url.hostname.toLowerCase()
  if (!hostname.includes('.') || hostname === 'localhost' || /\.(local|internal|localhost|test|invalid|example)$/i.test(hostname) ||
    isIP(hostname) || /[^a-z0-9.-]/.test(hostname) || hostname.length > 253) {
    throw new Error('Calendar links must use a public internet hostname')
  }
  return url.toString()
}

async function pinnedIp(hostname) {
  const entries = await lookup(hostname, { all: true, family: 4 })
  // Fail closed if ANY A record could route to an internal or reserved address.
  if (!entries.length || entries.some(entry => !isPublicIpv4(entry.address))) throw new Error('Calendar host is not publicly reachable')
  return entries[0].address
}

async function requestOnce(url) {
  const ip = await pinnedIp(url.hostname)
  return await new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    const req = request(url, {
      method: 'GET', agent: false, family: 4,
      lookup: (_hostname, _options, callback) => callback(null, ip, 4),
      headers: { Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.3', 'User-Agent': 'RE-MIND-Calendar-Subscription/1.0' },
      timeout: REQUEST_TIMEOUT_MS,
    }, response => {
      const code = response.statusCode || 0
      if ([301, 302, 303, 307, 308].includes(code)) {
        const location = response.headers.location
        response.resume()
        resolve({ redirect: typeof location === 'string' ? location : null })
        return
      }
      if (code !== 200) { response.resume(); reject(new Error('Calendar source is unavailable')); return }
      const length = Number(response.headers['content-length'])
      if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
        response.destroy(new Error('Calendar feed is too large')); return
      }
      response.on('data', chunk => {
        size += chunk.length
        if (size > MAX_RESPONSE_BYTES) { response.destroy(new Error('Calendar feed is too large')); return }
        chunks.push(chunk)
      })
      response.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8') }))
      response.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('Calendar source timed out')))
    req.on('error', reject)
    req.end()
  })
}

export async function fetchCalendarText(raw) {
  let current = new URL(normalizeCalendarUrl(raw))
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const result = await requestOnce(current)
    if (typeof result.body === 'string') {
      if (!/^\s*BEGIN:VCALENDAR\s*\r?\n/i.test(result.body)) throw new Error('This link does not contain an iCal calendar')
      return result.body
    }
    if (!result.redirect || hop === MAX_REDIRECTS) throw new Error('Calendar redirect is unsupported')
    current = new URL(normalizeCalendarUrl(new URL(result.redirect, current).toString()))
  }
  throw new Error('Calendar source is unavailable')
}
