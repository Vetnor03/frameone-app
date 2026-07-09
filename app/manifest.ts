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
        src: versionedIconPath('/icon.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  }
}
