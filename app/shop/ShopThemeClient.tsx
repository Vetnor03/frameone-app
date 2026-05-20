'use client'

import { useEffect } from 'react'

const SHOP_THEME = '#f6f3ed'

export default function ShopThemeClient() {
  useEffect(() => {
    const html = document.documentElement
    const body = document.body

    const previousHtmlBackground = html.style.backgroundColor
    const previousBodyBackground = body.style.backgroundColor

    html.style.backgroundColor = SHOP_THEME
    body.style.backgroundColor = SHOP_THEME

    const metaTags = Array.from(document.querySelectorAll('meta[name="theme-color"]')) as HTMLMetaElement[]
    const previousThemeColors = metaTags.map((tag) => tag.content)

    if (metaTags.length === 0) {
      const tag = document.createElement('meta')
      tag.setAttribute('name', 'theme-color')
      tag.setAttribute('content', SHOP_THEME)
      document.head.appendChild(tag)
      metaTags.push(tag)
      previousThemeColors.push('')
    } else {
      metaTags.forEach((tag) => {
        tag.content = SHOP_THEME
      })
    }

    return () => {
      html.style.backgroundColor = previousHtmlBackground
      body.style.backgroundColor = previousBodyBackground
      metaTags.forEach((tag, index) => {
        const previous = previousThemeColors[index]
        if (previous) {
          tag.content = previous
        }
      })
    }
  }, [])

  return null
}
