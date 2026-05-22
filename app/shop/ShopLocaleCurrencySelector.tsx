'use client'

type Props = { language: 'en' | 'no'; currency: 'EUR' | 'USD' | 'NOK' }

export default function ShopLocaleCurrencySelector({ language, currency }: Props) {
  return (
    <select
      aria-label="Language and currency"
      className="bg-transparent pr-4 text-right text-xs text-black/70 outline-none"
      value={`${language}-${currency.toLowerCase()}`}
      onChange={(event) => {
        const [nextLanguage, nextCurrency] = event.target.value.split('-')
        window.location.href = `/shop?lang=${nextLanguage}&currency=${nextCurrency.toUpperCase()}`
      }}
    >
      <option value="en-eur">English (EUR €)</option>
      <option value="en-usd">English (USD $)</option>
      <option value="no-nok">Norwegian (NOK kr)</option>
    </select>
  )
}
