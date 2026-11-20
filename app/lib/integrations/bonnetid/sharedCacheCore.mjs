// Database-independent distributed lease orchestration, with no per-process state.
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

export async function withSharedIrnCache({
  key, ttlSeconds, claim, publish, fail, load, sleep = wait, maxWaits = 30,
}) {
  if (typeof key !== 'string' || !key.startsWith('irn:') || key.length > 180) {
    throw new Error('Invalid IRN shared cache key')
  }
  for (let attempt = 0; attempt <= maxWaits; attempt++) {
    const result = await claim(key, ttlSeconds)
    if (result?.state === 'hit') {
      if (!Array.isArray(result.payload)) throw new Error('Invalid IRN cached payload')
      return result.payload
    }
    if (result?.state === 'cooldown') throw new Error('IRN temporarily unavailable; retry shortly')
    if (result?.state === 'claimed') {
      const token = result.token
      if (typeof token !== 'string' || !token) throw new Error('Invalid IRN cache lease')
      try {
        const payload = await load()
        if (!Array.isArray(payload)) throw new Error('Invalid IRN upstream payload')
        const published = await publish(key, token, payload)
        if (published !== true) throw new Error('IRN cache lease lost before publish')
        return payload
      } catch (error) {
        try { await fail(key, token) } catch { /* Keep original error */ }
        throw error
      }
    }
    if (result?.state !== 'pending') throw new Error('Invalid IRN cache response')
    if (attempt === maxWaits) break
    await sleep(500)
  }
  // A concurrent request is still fetching; fail closed instead of hitting IRN again.
  throw new Error('IRN shared cache is being refreshed; retry shortly')
}
