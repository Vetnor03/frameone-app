import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const chrome = readFileSync(new URL('../app/shop/ShopChrome.tsx', import.meta.url), 'utf8')

test('footer brand copy is localized only for Norwegian with explicit line breaks', () => {
  assert.match(
    chrome,
    /language === "no" \? \(\s*<>\s*Det du trenger, når du trenger det\.\s*<br \/>\s*Skapt for å passe inn i hjemmet\s*<br \/>\s*og hverdagen din\.\s*<\/>\s*\) : \(\s*<>\s*RE:MIND gives you what matters,\s*<br \/>\s*beautifully displayed\. Less screen time\.\s*<br \/>\s*More presence\.\s*<\/>\s*\)/,
  )
})
