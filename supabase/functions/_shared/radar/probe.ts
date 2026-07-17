export const SUPPORTED_TYPES = new Set(['text/html', 'application/json', 'application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml'])
const LOCAL_NAMES = /(^|\.)(localhost|localhost\.localdomain|local|internal|home|lan)$/i
const VOLATILE_JSON_KEYS = new Set(['request_id', 'trace_id', 'server_time', 'generated_at'])

export function validatePublicUrl(raw: string): URL {
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('invalid_url') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('blocked_protocol')
  if (url.username || url.password) throw new Error('embedded_credentials')
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('blocked_port')
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host || LOCAL_NAMES.test(host) || host.endsWith('.local') || host === 'metadata.google.internal') throw new Error('blocked_hostname')
  if (isBlockedIp(host)) throw new Error('blocked_address')
  return url
}

export function isBlockedIp(ip: string) {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (value.includes(':')) {
    if (value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || /^fe[89ab]/.test(value) || value.startsWith('ff')) return true
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
    return mapped ? isBlockedIp(mapped) : false
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(value)) return false
  const p = value.split('.').map(Number); if (p.some((n) => n < 0 || n > 255)) return true
  return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) ||
    (p[0] === 198 && (p[1] === 18 || p[1] === 19)
  )
}

export async function assertPublicDns(url: URL, resolver = Deno.resolveDns) {
  if (isBlockedIp(url.hostname)) throw new Error('blocked_address')
  let addresses: string[] = []
  try {
    const [v4, v6] = await Promise.all([
      resolver(url.hostname, 'A').catch(() => []), resolver(url.hostname, 'AAAA').catch(() => []),
    ])
    addresses = [...v4, ...v6] as string[]
  } catch { throw new Error('dns_validation_failed') }
  if (!addresses.length) throw new Error('dns_validation_failed')
  if (addresses.some(isBlockedIp)) throw new Error('blocked_dns_address')
}

function cleanText(value: string) { return value.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|quot|#39);/gi, ' ').replace(/\s+/g, ' ').trim() }
export function normalizeHtml(html: string) {
  let x = html.replace(/<(script|style|svg|canvas|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ')
  x = x.replace(/<[^>]+(?:cookie|consent|advert|banner)[^>]*>[\s\S]*?<\/[^>]+>/gi, ' ')
  x = x.replace(/\b(?:rendered|generated|request time)\s*(?:at|:)\s*\d{4}-\d\d-\d\d[T ][\d:.+Z-]+/gi, ' ')
  const title = x.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''
  const description = x.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] || ''
  const meaningful = x.match(/<(main|article)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] || x.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || x
  return cleanText(`${title} ${description} ${meaningful}`).slice(0, 300_000)
}
function entries(xml: string) {
  return [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, 50).map((m) => {
    const b=m[2]; const field=(names:string[]) => { for (const n of names) { const v=b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`,'i'))?.[1] || (n==='link' ? b.match(/<link[^>]+href=["']([^"']+)/i)?.[1] : ''); if(v) return cleanText(v) } return '' }
    return [field(['guid','id']),field(['link']),field(['title']),field(['published','pubDate','updated']),field(['summary','description'])].join('|')
  })
}
export function normalizeXml(xml: string, sitemap = /<urlset\b/i.test(xml)) {
  if (sitemap) return [...xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)].slice(0,1000).map(m=>{ const loc=cleanText(m[1].match(/<loc[^>]*>([\s\S]*?)<\/loc>/i)?.[1]||''); const lm=cleanText(m[1].match(/<lastmod[^>]*>([\s\S]*?)<\/lastmod>/i)?.[1]||''); return `${loc}|${lm}` }).join('\n')
  return entries(xml).join('\n')
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0,1000).map(canonical)
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([k])=>!VOLATILE_JSON_KEYS.has(k.toLowerCase())).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]))
  return value
}
export function normalizeJson(text: string) { return JSON.stringify(canonical(JSON.parse(text))).slice(0,300_000) }
export function normalizeContent(text: string, contentType: string) {
  const type=contentType.split(';')[0].trim().toLowerCase()
  if (type==='text/html') return { normalized:normalizeHtml(text), sourceType:'html' }
  if (type==='application/json') return { normalized:normalizeJson(text), sourceType:'json' }
  if (['application/rss+xml','application/atom+xml','application/xml','text/xml'].includes(type)) { const sitemap=/<urlset\b/i.test(text); return { normalized:normalizeXml(text,sitemap), sourceType:sitemap?'sitemap':/<feed\b/i.test(text)?'atom':'rss' } }
  throw new Error('unsupported_content_type')
}
export async function sha256(value: string) { const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('') }
export function errorBackoffMinutes(errors: number) { return [15,30,60,180,360][Math.min(Math.max(errors-1,0),4)] }
