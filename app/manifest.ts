import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FRAME',
    short_name: 'FRAME',
    start_url: '/', // ✅ let app decide based on auth
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#061b24',
    theme_color: '#061b24',
  }
}
