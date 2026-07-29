'use client'

type Props = { language: 'en' | 'no' }

export default function ShopLanguageSelector({ language }: Props) {
  return (
    <select
      aria-label="Language"
      className="bg-transparent pr-4 text-right text-xs text-black/70 outline-none"
      value={language}
      onChange={(event) => {
        const language = event.target.value
        localStorage.setItem('remind-shop-language', language)
        document.cookie = `remind-shop-lang=${language}; Path=/; Max-Age=31536000; SameSite=Lax`
        const url = new URL(window.location.href)
        url.searchParams.set('lang', language)
        url.searchParams.delete('currency')
        window.location.href = `${url.pathname}${url.search}${url.hash}`
      }}
    >
      <option value="en">English</option>
      <option value="no">Norsk</option>
    </select>
  )
}
