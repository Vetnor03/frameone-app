'use client'

import { useRouter } from 'next/navigation'
import { NORWEGIAN_SHOP_TITLE } from './title'
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
        if (nextLanguage === 'no') {
          document.title = NORWEGIAN_SHOP_TITLE
        } else if (document.documentElement.dataset.shopPageTitle) {
          document.title = document.documentElement.dataset.shopPageTitle
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
