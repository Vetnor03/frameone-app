'use client'

import { useRouter } from 'next/navigation'
import { NORWEGIAN_SHOP_TITLE } from './title'

type Props = { language: 'en' | 'no' }

export default function ShopLanguageSelector({ language }: Props) {
  const router = useRouter()
  const labels = language === 'no'
    ? { en: 'Engelsk', no: 'Norsk' }
    : { en: 'English', no: 'Norwegian' }

  return (
    <select
      aria-label="Language"
      className="bg-transparent pr-4 text-right text-xs text-black/70 outline-none"
      value={language}
      onChange={(event) => {
        const nextLanguage = event.target.value
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
      <option value="en">{labels.en}</option>
      <option value="no">{labels.no}</option>
    </select>
  )
}
