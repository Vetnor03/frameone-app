'use client'

type Props = { language: 'en' | 'no' }

export default function ShopLanguageSelector({ language }: Props) {
  const labels = language === 'no'
    ? { en: 'Engelsk', no: 'Norsk' }
    : { en: 'English', no: 'Norwegian' }

  return (
    <select
      aria-label="Language"
      className="bg-transparent pr-4 text-right text-xs text-black/70 outline-none"
      value={language}
      onChange={(event) => {
        const url = new URL(window.location.href)
        url.searchParams.set('lang', event.target.value)
        url.searchParams.delete('currency')
        window.location.href = `${url.pathname}${url.search}${url.hash}`
      }}
    >
      <option value="en">{labels.en}</option>
      <option value="no">{labels.no}</option>
    </select>
  )
}
