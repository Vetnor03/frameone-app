export function safePublicRecipeUrl(raw: unknown): URL | null
export function fetchPublicRecipePage(initialUrl: string | URL, fetcher?: typeof fetch, options?: RequestInit): Promise<Response>
