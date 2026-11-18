export type NorwegianPlace = { name: string; latitude: number; longitude: number }
export function verifiedNorwegianPlace(payload: unknown, requestedCity: string): NorwegianPlace
export function resolveNorwegianCity(city: string): Promise<NorwegianPlace>
