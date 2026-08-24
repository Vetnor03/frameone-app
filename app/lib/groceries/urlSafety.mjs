export function safePublicRecipeUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2_000) return null
  let url
  try { url = new URL(raw) } catch { return null }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:') || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null
  return url
}

export async function fetchPublicRecipePage(initialUrl, fetcher = fetch, options = {}) {
  let url = safePublicRecipeUrl(initialUrl)
  if (!url) throw new Error('unsafe_url')
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetcher(url, { ...options, redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    url = location ? safePublicRecipeUrl(new URL(location, url).toString()) : null
    if (!url) throw new Error('unsafe_redirect')
  }
  throw new Error('too_many_redirects')
}
