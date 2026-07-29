'use client'

import { useEffect, useLayoutEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export type ShopLanguage = 'en' | 'no'
export const SHOP_LANGUAGE_KEY = 'remind-shop-language'

// These are rewrites rather than word-for-word translations. Product names are
// deliberately absent: they are part of RE:MIND's established naming system.
const nb: Record<string, string> = {
  '30 day returns': '30 dagers åpent kjøp', '5 year warranty': '5 års garanti',
  'Frames': 'Rammer', 'Mattes': 'Passepartouter', 'Bundles': 'Pakker', 'About': 'Om oss',
  'Open shopping cart': 'Åpne handlekurven', 'Shop pages': 'Butikksider', 'Language': 'Språk',
  'English': 'English', 'Norwegian': 'Norsk', 'SHOP': 'BUTIKK', 'SUPPORT': 'HJELP', 'COMPANY': 'OM RE:MIND',
  'Shipping': 'Levering', 'Returns': 'Retur', 'Warranty': 'Garanti', 'Sustainability': 'Bærekraft',
  'Contact': 'Kontakt', 'Press': 'Presse', 'Terms': 'Vilkår', 'Privacy': 'Personvern', 'Cookies': 'Informasjonskapsler',
  'FREE SHIPPING': 'GRATIS FRAKT', '30 DAY RETURNS': '30 DAGERS ÅPENT KJØP', '5 YEAR WARRANTY': '5 ÅRS GARANTI',
  'No questions asked': 'Enkelt og uproblematisk', 'Peace of mind': 'Trygghet som varer',
  'Delivery truck icon': 'Ikon av en varebil', 'Circular arrows return icon': 'Ikon for retur', 'Shield warranty icon': 'Ikon for garanti',
  'STAY IN THE LOOP': 'FØLG MED', 'New frames, updates and ideas.': 'Nye rammer, oppdateringer og små glimt fra oss.',
  '© 2026 RE:MIND. All rights reserved.': '© 2026 RE:MIND. Alle rettigheter forbeholdt.',
  'Back to home': 'Tilbake til forsiden', 'All frames': 'Alle rammer', 'All mattes': 'Alle passepartouter',
  'Your cart': 'Handlekurven din', 'Review your selections before checkout.': 'Se over valgene dine før du går videre.',
  'Your cart is empty': 'Handlekurven er tom', 'Build a RE:MIND that feels right at home.': 'Sett sammen en RE:MIND som passer hjemme hos deg.',
  'BUILD YOUR RE:MIND': 'SETT SAMMEN DIN RE:MIND', 'Order summary': 'Oppsummering', 'Discount code': 'Rabattkode',
  'Enter code': 'Skriv inn kode', 'APPLY': 'BRUK', 'Subtotal': 'Delsum', 'Discount': 'Rabatt', 'Shipping': 'Frakt',
  'Free': 'Gratis', 'Total': 'Totalt', 'TOTAL': 'TOTALT', 'CHECKOUT': 'GÅ TIL KASSEN',
  'Taxes included. Secure checkout.': 'Inkludert avgifter. Sikker betaling.', 'Continue shopping': 'Handle videre',
  'Frame: ': 'Ramme: ', 'Matte: ': 'Passepartout: ', 'Frames: ': 'Rammer: ', 'Mattes: ': 'Passepartouter: ',
  'Qty': 'Antall', 'Remove': 'Fjern', 'Decrease quantity': 'Reduser antall', 'Increase quantity': 'Øk antall',
  'Discount code applied — 10% off.': 'Rabattkoden er lagt til – du får 10 % rabatt.',
  'This discount code is not valid.': 'Denne rabattkoden er ikke gyldig.',
  'IN STOCK': 'PÅ LAGER', 'LOW STOCK': 'FÅ IGJEN', 'OUT OF STOCK': 'UTSOLGT', 'COMING SOON': 'KOMMER SNART',
  'More styles are coming.': 'Flere uttrykk er på vei.', 'Heart your favourites and help us choose what comes next.': 'Lagre favorittene dine og hjelp oss å velge hva som kommer videre.',
  'Finish': 'Overflate', 'ADD TO CART': 'LEGG I HANDLEKURVEN', 'Added to cart.': 'Lagt i handlekurven.',
  'DISPLAY': 'SKJERM', 'FRAME': 'RAMME', 'MATTE': 'PASSEPARTOUT', 'YOUR RE:MIND': 'DIN RE:MIND',
  'Dark': 'Mørk', 'Light': 'Lys', 'Display appearance': 'Skjermvisning', 'What’s included': 'Dette følger med',
  'RE:MIND display · Your frame · Your matte · Charging cable · Setup guide': 'RE:MIND-skjerm · Valgt ramme · Valgt passepartout · Ladekabel · Kom i gang-veiledning',
  'Configuration added to cart.': 'Valgene dine er lagt i handlekurven.',
  'Frames that': 'Rammer som', 'fit your life.': 'passer livet ditt.',
  'Reminders, weather and events': 'Påminnelser, vær og avtaler', 'at a glance,': 'samlet på ett sted,', 'without checking your phone.': 'uten at du må finne frem mobilen.',
  'SHOP FRAMES': 'SE RAMMENE', 'Swap in seconds': 'Bytt på et øyeblikk', 'Satisfying click. Designed for ease.': 'Et lite klikk. Så enkelt er det.',
  'MAKE IT YOURS': 'GJØR DEN TIL DIN', 'Popular Frames': 'Populære rammer', 'View all frames →': 'Se alle rammer →',
  'Change the feel.': 'Et nytt uttrykk.', 'Not the frame.': 'Samme ramme.', 'Choose the perfect matte to match': 'Velg passepartouten som kler', 'your space and reduce glare.': 'rommet og demper gjenskinn.', 'SHOP MATTES': 'SE PASSEPARTOUTER',
  'BUILT TO LIVE WITH YOU': 'LAGET FOR Å VÆRE EN DEL AV HJEMMET', 'Made to stay. Easy to change.': 'Laget for å vare. Enkel å fornye.',
  'READY FROM DAY ONE': 'KLAR FRA FØRSTE DAG', 'LONG BATTERY LIFE': 'LANG BATTERITID', 'NOT LOCKED TO ONE LOOK': 'ET UTTRYKK SOM KAN ENDRES',
  'Frequently asked questions': 'Ofte stilte spørsmål', 'A few helpful details before your RE:MIND arrives.': 'Nyttig å vite før RE:MIND kommer hjem til deg.',
  'Cookies policy': 'Informasjonskapsler', 'Last updated: July 28, 2026': 'Sist oppdatert 28. juli 2026',
  'Go back': 'Gå tilbake', 'Download ↓': 'Last ned ↓', 'Media assets': 'Pressemateriell', 'Logo & product pictures': 'Logo og produktbilder',
  'Email address': 'E-postadresse', 'Your email': 'E-postadressen din', 'Sign up for the newsletter': 'Meld deg på nyhetsbrevet',
  'Something went wrong. Please try again.': 'Noe gikk galt. Prøv gjerne igjen.',
  'Thank you for joining our newsletter! Please check your inbox.': 'Takk for at du vil følge oss. Sjekk innboksen din.',
  'Early access waitlist open': 'Ventelisten er åpen', 'Join Waitlist': 'Bli med på ventelisten', 'No commitment. No spam.': 'Helt uforpliktende. Ingen spam.',
  'Name (optional)': 'Navn (valgfritt)', 'Email': 'E-post', 'Joining...': 'Melder deg på …',
  'Thank you! You are now on the RE:MIND waitlist.': 'Takk! Du står nå på ventelisten til RE:MIND.',
  'Shop bundles': 'Se pakkene', 'Save': 'Spar', 'Separately': 'Kjøpt enkeltvis', 'You save': 'Du sparer',
  'ADD BUNDLE TO CART': 'LEGG PAKKEN I HANDLEKURVEN', 'Your bundle was added to cart.': 'Pakken er lagt i handlekurven.',
  'Every component is included in the bundle price.': 'Alt du velger, er inkludert i pakkeprisen.',
  'Returns': 'Retur', 'Changed your mind? You have 30 days to return your order.': 'Ombestemt deg? Du har 30 dager på å returnere bestillingen.',
  'Return window': 'Returfrist', 'Start a return': 'Slik starter du en retur', 'Packing your item': 'Pakk varen godt', 'Refunds': 'Tilbakebetaling', 'Faulty items': 'Feil eller skade',
  'You may request a return within 30 days of receiving your order. The product should be returned in its original condition with its accessories and, where possible, its original packaging.': 'Du kan melde fra om retur innen 30 dager etter at du mottok bestillingen. Varen må være i opprinnelig stand, med tilbehør og gjerne i originalemballasjen.',
  'Contact us with your order number and the items you would like to send back. We will reply with return instructions and the correct return address.': 'Send oss ordrenummeret og fortell hva du ønsker å returnere. Vi svarer med en enkel veiledning og riktig returadresse.',
  'Pack every item securely to prevent damage in transit. Please remove personal information, sign out of the device and include all cables and accessories supplied with it.': 'Pakk alt godt, slik at det ikke blir skadet underveis. Fjern personopplysninger, logg ut av enheten og legg ved kabler og annet tilbehør som fulgte med.',
  'After the return has arrived and been checked, we will issue the approved refund to your original payment method. Your bank may need additional time to show it in your account.': 'Når returen er mottatt og kontrollert, betaler vi tilbake det godkjente beløpet til samme betalingsmåte. Det kan ta noen ekstra dager før beløpet vises på kontoen din.',
  'If something is faulty or arrived damaged, contact us before returning it. Describe the issue and include photographs when helpful so we can offer the quickest solution.': 'Er det en feil ved varen, eller kom den frem med skade? Ta kontakt før du sender den tilbake. Beskriv hva som har skjedd, og legg gjerne ved bilder, så finner vi raskeste løsning.',
  'Clear delivery information, from our door to yours.': 'Oversiktlig informasjon om reisen fra oss til deg.', 'Order processing': 'Behandling av bestillingen', 'Delivery times': 'Leveringstid', 'Shipping cost': 'Fraktpris', 'Address changes': 'Endre adresse', 'Damaged parcels': 'Skadet pakke',
  'Orders are prepared on business days. Once your parcel leaves us, we will email a shipping confirmation with tracking details so you can follow its journey.': 'Vi klargjør bestillinger på virkedager. Når pakken er sendt, får du en e-post med sporingsinformasjon, slik at du kan følge den hele veien.',
  'Estimated delivery times are shown during checkout and begin after your order has been dispatched. Remote destinations and busy holiday periods may take a little longer.': 'Forventet leveringstid vises i kassen og regnes fra bestillingen er sendt. Til enkelte steder og i travle høytider kan det ta litt lengre tid.',
  'The available delivery methods and their exact prices are displayed at checkout. Orders that meet the free-shipping threshold shown in the shop are delivered at no additional shipping cost.': 'Tilgjengelige leveringsmåter og nøyaktige priser vises i kassen. Når bestillingen passerer grensen for gratis frakt som står i butikken, betaler du ikke ekstra for levering.',
  'Contact us as soon as possible if you entered the wrong address. We can update it before dispatch, but changes may not be possible once a parcel is with the carrier.': 'Ta kontakt så snart som mulig hvis adressen ble feil. Vi kan endre den før pakken sendes, men ikke alltid etter at transportøren har overtatt.',
  'If your parcel arrives visibly damaged, photograph the packaging and the product, keep all packing materials and contact us promptly. We will help put things right.': 'Er pakken synlig skadet ved levering, ta bilder av både emballasjen og produktet, behold pakkematerialet og kontakt oss. Vi hjelper deg videre.',
  '5 YEAR WARRANTY': '5 ÅRS GARANTI', 'Built to stay.': 'Laget for å vare.', "What's covered": 'Dette dekker garantien', "What's not covered": 'Dette dekkes ikke', 'Battery replacement': 'Bytte av batteri', 'Your consumer rights': 'Rettighetene dine', 'Need help?': 'Trenger du hjelp?',
  'Every RE:MIND display is backed by our 5-year limited warranty.': 'Alle RE:MIND-skjermer leveres med vår begrensede garanti på fem år.',
  'Our 5-year warranty is provided in addition to your statutory consumer rights.': 'Femårsgarantien kommer i tillegg til rettighetene du allerede har etter norsk forbrukerlovgivning.',
  'RE:MIND | What matters. Beautifully displayed.': 'RE:MIND | Det som betyr noe, vakkert presentert.',
  'About | RE:MIND': 'Om oss | RE:MIND', 'Bundles | RE:MIND': 'Pakker | RE:MIND', 'Contact | RE:MIND': 'Kontakt | RE:MIND',
  'Returns | RE:MIND': 'Retur | RE:MIND', 'Shipping | RE:MIND': 'Levering | RE:MIND', 'Sustainability | RE:MIND': 'Bærekraft | RE:MIND',
  '5 Year Warranty | RE:MIND': '5 års garanti | RE:MIND',
}

const patterns: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^Free shipping over (.+)$/, m => `Gratis frakt over ${m[1]}`],
  [/^On orders over (.+)$/, m => `På bestillinger over ${m[1]}`],
  [/^Quantity for (.+)$/, m => `Antall for ${m[1]}`],
  [/^Availability: (.+)$/, m => `Tilgjengelighet: ${nb[m[1]] ?? m[1]}`],
  [/^View (.+) frame$/, m => `Se rammen ${m[1]}`], [/^View (.+) matte$/, m => `Se passepartouten ${m[1]}`],
  [/^Replacement frame$/, () => 'Ekstra ramme'], [/^Replacement matte$/, () => 'Ekstra passepartout'],
]

function translate(value: string) {
  if (nb[value]) return nb[value]
  for (const [pattern, render] of patterns) { const match = value.match(pattern); if (match) return render(match) }
  return value
}

function localize(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const value = node.nodeValue ?? ''
    const trimmed = value.trim()
    if (!trimmed) continue
    const translated = translate(trimmed)
    if (translated !== trimmed) node.nodeValue = value.replace(trimmed, translated)
  }
  root.querySelectorAll<HTMLElement>('[aria-label],[alt],[placeholder],[title]').forEach(element => {
    for (const attr of ['aria-label', 'alt', 'placeholder', 'title']) {
      const value = element.getAttribute(attr); if (value) element.setAttribute(attr, translate(value))
    }
  })
  root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
    const url = new URL(link.href, window.location.origin)
    if (url.origin !== window.location.origin) return
    if (url.pathname.startsWith('/shop') || ['/terms', '/privacy', '/cookies'].includes(url.pathname)) {
      url.searchParams.set('lang', 'no'); link.href = `${url.pathname}${url.search}${url.hash}`
    }
  })
}

export default function ShopLocaleBridge() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requested = searchParams.get('lang')
  const language: ShopLanguage = requested === 'no' ? 'no' : 'en'

  useLayoutEffect(() => {
    document.documentElement.lang = language === 'no' ? 'nb' : 'en'
    localStorage.setItem(SHOP_LANGUAGE_KEY, language)
    document.cookie = `remind-shop-lang=${language}; Path=/; Max-Age=31536000; SameSite=Lax`
    if (language !== 'no') return
    document.title = translate(document.title)
    document.querySelectorAll<HTMLMetaElement>('meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]').forEach(meta => {
      if (meta.content) meta.content = translate(meta.content)
    })
    localize(document.body)
    const observer = new MutationObserver(records => records.forEach(record => {
      if (record.type === 'characterData' && record.target.nodeValue) {
        const value = record.target.nodeValue; const trimmed = value.trim(); const translated = translate(trimmed)
        if (translated !== trimmed) record.target.nodeValue = value.replace(trimmed, translated)
      }
      record.addedNodes.forEach(node => { if (node.nodeType === Node.ELEMENT_NODE) localize(node as ParentNode) })
    }))
    observer.observe(document.body, { childList: true, characterData: true, subtree: true })
    return () => observer.disconnect()
  }, [language, pathname])

  useEffect(() => {
    if (requested === 'no' || requested === 'en') return
    const saved = localStorage.getItem(SHOP_LANGUAGE_KEY)
    if (saved === 'no') {
      const url = new URL(window.location.href); url.searchParams.set('lang', 'no'); window.location.replace(`${url.pathname}${url.search}${url.hash}`)
    }
  }, [requested])

  return null
}
