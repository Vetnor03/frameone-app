import type { MetadataRoute } from 'next'
import { versionedIconPath } from './lib/iconVersion'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RE:MIND',
    short_name: 'RE:MIND',
    start_url: '/', // ✅ let app decide based on auth
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#061b24',
    theme_color: '#f5f6f8',
    icons: [
      {
        src: versionedIconPath('/r_Logo.png'),
        sizes: '856x856',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: versionedIconPath('/r_Logo.png'),
        sizes: '856x856',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
