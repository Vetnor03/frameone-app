export const ICON_VERSION = 'remind-app-logo-20260816'

export function versionedIconPath(path: string) {
  return `${path}?v=${ICON_VERSION}`
}
