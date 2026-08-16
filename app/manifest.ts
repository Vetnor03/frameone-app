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
        src: versionedIconPath('/AppLogo.png'),
        sizes: '1254x1254',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: versionedIconPath('/AppLogo.png'),
        sizes: '1254x1254',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
