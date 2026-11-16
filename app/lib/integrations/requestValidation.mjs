// Keep the public request boundary narrow: plain text only, no credentials or URLs required.
export function validateIntegrationRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { appName, note } = value
  if (typeof appName !== 'string' || (note != null && typeof note !== 'string')) return null

  const cleanName = appName.trim().replace(/\s+/g, ' ')
  const cleanNote = (note || '').trim()
  if (cleanName.length < 2 || cleanName.length > 80 || cleanNote.length > 500) return null
  return { appName: cleanName, note: cleanNote || null }
}
