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
  assert.match(home, /setSuccess\('added'\)[\s\S]*await waitForConfirmation\(\)[\s\S]*onClose\(\)/)
})
