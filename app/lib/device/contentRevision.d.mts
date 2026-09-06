export type RevisionChange = { revision: number; changed_modules?: string[] | null }
export function affectedModulesSince(args: {
  since: number
  currentRevision: number
  changes?: RevisionChange[] | null
  fallback?: string[]
}): string[]
