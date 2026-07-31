'use client'

import { useRouter } from 'next/navigation'
import { ENGLISH_SHOP_TITLE, NORWEGIAN_SHOP_TITLE } from './title'
import { SHOP_LANGUAGE_COOKIE } from './language'

type Props = { language: 'en' | 'no' }

export default function ShopLanguageSelector({ language }: Props) {
  const router = useRouter()
  const optionLabels = language === 'no'
    ? { en: 'English', no: 'Norwegian' }
    : { en: 'Engelsk', no: 'Norsk' }
  const selectedLabel = language === 'no' ? 'Norsk' : 'English'

  return (
    <select
      aria-label="Language"
      className="bg-transparent pr-4 text-right text-xs text-black/70 outline-none"
      value={`selected-${language}`}
      onChange={(event) => {
        const nextLanguage = event.target.value
        document.cookie = `${SHOP_LANGUAGE_COOKIE}=${nextLanguage}; Path=/; Max-Age=31536000; SameSite=Lax`
        const url = new URL(window.location.href)
        url.searchParams.set('lang', nextLanguage)
        url.searchParams.delete('currency')
        const title = nextLanguage === 'no' ? NORWEGIAN_SHOP_TITLE : ENGLISH_SHOP_TITLE
        document.title = title
        for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
          document.querySelector(selector)?.setAttribute('content', title)
        }
        router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false })
      }}
    >
      <option value={`selected-${language}`} hidden>{selectedLabel}</option>
      <option value="en">{optionLabels.en}</option>
      <option value="no">{optionLabels.no}</option>
    </select>
  )
}
