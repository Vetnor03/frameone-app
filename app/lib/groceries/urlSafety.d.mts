export type RecipeDnsLookup = (hostname: string) => Promise<Array<{ address: string; family?: number }> | { address: string; family?: number }>
export function isPrivateRecipeAddress(raw: unknown): boolean
export function safePublicRecipeUrl(raw: unknown): URL | null
export function assertPublicRecipeHost(url: URL, lookup?: RecipeDnsLookup): Promise<void>
export function fetchPublicRecipePage(initialUrl: string | URL, fetcher?: typeof fetch, options?: RequestInit, lookup?: RecipeDnsLookup): Promise<Response>
