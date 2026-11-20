/** Homey Web API authorization-code OAuth2 request builders. Never log secrets. */
const AUTHORIZE_URL = 'https://api.athom.com/oauth2/authorise'
const TOKEN_URL = 'https://api.athom.com/oauth2/token'

export function homeyAuthorizationUrl({ clientId, redirectUri, state }) {
  if (!clientId || !state || !redirectUri) throw new Error('Missing Homey OAuth configuration')
  const redirect = new URL(redirectUri)
  const localDev = redirect.protocol === 'http:' && redirect.hostname === 'localhost'
  if (redirect.protocol !== 'https:' && !localDev) throw new Error('Homey OAuth callback must use HTTPS')
  const url = new URL(AUTHORIZE_URL)
  // Homey's OAuth endpoint documents authorization_type, not standard response_type.
  url.searchParams.set('authorization_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirect.toString())
  url.searchParams.set('state', state)
  return url.toString()
}

export function homeyTokenRequest({ clientId, clientSecret, code, refreshToken }) {
  if (!clientId || !clientSecret || Boolean(code) === Boolean(refreshToken)) {
    throw new Error('Invalid Homey token request')
  }
  const form = new URLSearchParams()
  if (code) {
    form.set('grant_type', 'authorization_code')
    form.set('authorization_code', code)
  } else {
    form.set('grant_type', 'refresh_token')
    form.set('refresh_token', refreshToken)
  }
  return {
    url: TOKEN_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: form.toString(),
  }
}
