export const APP_ICON_PATH = '/AppIcon-1024v2.png'
export const APP_ICON_SIZE = '1536x1024'
export const ICON_VERSION = 'remind-app-icon-20260601'

export function versionedIconPath(path: string) {
  return `${path}?v=${ICON_VERSION}`
}
