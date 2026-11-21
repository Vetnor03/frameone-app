// Google's email claim is available only if the account explicitly granted
// the basic email identity permission. Never infer it from the RE:MIND login.
export function hasGoogleEmailScope(scope) {
  return typeof scope === 'string' && scope.split(/\s+/).some(value =>
    value === 'email' || value === 'https://www.googleapis.com/auth/userinfo.email'
  )
}

export function verifiedGoogleEmail(profile) {
  if (!profile || typeof profile !== 'object') return null
  const email = typeof profile.email === 'string' ? profile.email.trim() : ''
  if ((profile.email_verified !== true && profile.verified_email !== true)
    || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}
