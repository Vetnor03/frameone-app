export const ICON_VERSION = 'remind-app-icon-20260709'

export function versionedIconPath(path: string) {
  return `${path}?v=${ICON_VERSION}`
}
