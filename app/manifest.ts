import type { MetadataRoute } from 'next'
import { APP_ICON_PATH, APP_ICON_SIZE, versionedIconPath } from './lib/iconVersion'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Re-mind',
    short_name: 'Re-mind',
    start_url: '/', // ✅ let app decide based on auth
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#061b24',
    theme_color: '#061b24',
    icons: [
      {
        src: versionedIconPath(APP_ICON_PATH),
        sizes: APP_ICON_SIZE,
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: versionedIconPath(APP_ICON_PATH),
        sizes: APP_ICON_SIZE,
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: versionedIconPath(APP_ICON_PATH),
        sizes: APP_ICON_SIZE,
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: versionedIconPath(APP_ICON_PATH),
        sizes: APP_ICON_SIZE,
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
