import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const home = await readFile(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('recipe actions expose localized loading and success feedback', () => {
  for (const message of [
    'IMPORTING RECIPE…', 'IMPORTERER OPPSKRIFT…',
    'SAVING RECIPE…', 'LAGRER OPPSKRIFT…',
    'ADDING TO GROCERIES…', 'LEGGER TIL I HANDLELISTEN…',
    'LOADING RECIPES…', 'LASTER OPPSKRIFTER…',
    'RECIPE SAVED', 'OPPSKRIFT LAGRET',
    'ADDED TO GROCERIES', 'LAGT TIL I HANDLELISTEN',
  ]) assert.match(home, new RegExp(message))

  assert.match(home, /disabled=\{busy\}[\s\S]*pendingAction === 'save'/)
  assert.match(home, /disabled=\{!selected\.length \|\| busy\}[\s\S]*pendingAction === 'add'/)
  assert.match(home, /setPendingAction\('add'\)[\s\S]*setSuccess\('added'\)[\s\S]*await waitForConfirmation\(\)[\s\S]*setPendingAction\(null\)[\s\S]*onClose\(\)/)
  const confirmationPeriod = home.match(/setSuccess\('added'\)([\s\S]*?)await waitForConfirmation\(\)/)?.[1]
  assert.ok(confirmationPeriod, 'the Add success confirmation should remain visible before closing')
  assert.doesNotMatch(confirmationPeriod, /setPendingAction\(null\)/, 'Add must remain locked during its success confirmation')
})
