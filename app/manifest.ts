import type { MetadataRoute } from 'next'
import { versionedIconPath } from './lib/iconVersion'

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
        src: versionedIconPath('/remind-icon.svg'),
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: versionedIconPath('/remind-icon.svg'),
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
