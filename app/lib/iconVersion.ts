export const ICON_VERSION = 'remind-r-logo-20260727'

export function versionedIconPath(path: string) {
  return `${path}?v=${ICON_VERSION}`
}
