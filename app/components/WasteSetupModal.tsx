'use client'

import { useEffect, useState } from 'react'

type Address = { addressId: string; label: string; municipalityNumber: string; municipalityName: string; addressCode?: string; streetName?: string; houseNumber?: string; postalCode?: string; postalPlace?: string; gnr?: string; bnr?: string; snr?: string; lat?: number; lon?: number }
type Preview = { date: string; title: string }

export default function WasteSetupModal({ language, onClose, onSaved }: { language: 'en' | 'no'; onClose: () => void; onSaved: (connected: boolean) => void }) {
  const [token, setToken] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Address[]>([])
  const [selected, setSelected] = useState<Address | null>(null)
  const [preview, setPreview] = useState<Preview[]>([])
  const [account, setAccount] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorKind, setErrorKind] = useState<'search' | 'preview' | ''>('')
  const [searchRetry, setSearchRetry] = useState(0)

  useEffect(() => { void import('@/app/lib/supabase').then(async ({ supabase }) => { const access = (await supabase.auth.getSession()).data.session?.access_token || ''; setToken(access); if (!access) return; const response = await fetch('/api/integrations/waste/status', { headers: { Authorization: `Bearer ${access}` } }); const json = await response.json(); if (json.connected) setAccount(json.account) }) }, [])
  useEffect(() => {
    if (!token || query.trim().length < 3 || selected) { setResults([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try { const response = await fetch(`/api/integrations/waste/search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }); const json = await response.json(); if (!response.ok) throw new Error(json.error); setResults(json.addresses || []); setError(''); setErrorKind('') } catch (e) { if ((e as Error).name !== 'AbortError') { setErrorKind('search'); setError(language === 'no' ? 'Adressesøket er midlertidig utilgjengelig. Prøv igjen.' : 'Address search is temporarily unavailable. Please retry.') } }
    }, 350)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, selected, token, language, searchRetry])

  async function choose(address: Address) {
    setSelected(address); setQuery(address.label); setResults([]); setLoading(true); setError('')
    try { const response = await fetch('/api/integrations/waste/connect', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ address, preview: true }) }); const json = await response.json(); if (!response.ok) throw new Error(json.error); setPreview(json.previewItems || []) }
    catch (e) { setErrorKind('preview'); const message = (e as Error).message; setError(message === 'Waste collection isn’t available for this address yet.' && language === 'no' ? 'Renovasjon er ikke tilgjengelig for denne adressen ennå.' : message || (language === 'no' ? 'Renovasjon er ikke tilgjengelig for denne adressen ennå.' : 'Waste collection isn’t available for this address yet.')) }
    finally { setLoading(false) }
  }
  async function save() {
    if (!selected) return; setLoading(true); setError('')
    try { const response = await fetch('/api/integrations/waste/connect', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ address: selected }) }); const json = await response.json(); if (!response.ok) throw new Error(json.error); setAccount(json.resolvedAddress?.label || selected.label); onSaved(true); onClose() }
    catch (e) { setError((e as Error).message || (language === 'no' ? 'Kunne ikke lagre. Prøv igjen.' : 'Could not save. Please retry.')) } finally { setLoading(false) }
  }
  async function disconnect() {
    setLoading(true); const response = await fetch('/api/integrations/waste/disconnect', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); setLoading(false)
    if (response.ok) { onSaved(false); onClose() } else setError(language === 'no' ? 'Kunne ikke koble fra.' : 'Could not disconnect.')
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4 sm:items-center"><div className="w-full max-w-sm rounded-3xl border border-[color:var(--bd-15)] bg-[color:var(--sheet-bg)] p-5 shadow-2xl">
    <div className="flex justify-between gap-3"><div><div className="font-semibold text-[color:var(--fg-90)]">{language === 'no' ? 'Renovasjon' : 'Waste collection'}</div><p className="mt-1 text-xs text-[color:var(--fg-45)]">{account || (language === 'no' ? 'Søk etter hjemmeadressen din.' : 'Search for your home address.')}</p></div><button onClick={onClose} aria-label="Close">×</button></div>
    {!account && <><label htmlFor="waste-address" className="mt-5 block text-[10px] tracking-widest text-[color:var(--fg-45)]">{language === 'no' ? 'HJEMMEADRESSE' : 'HOME ADDRESS'}</label><input id="waste-address" value={query} onChange={e => { setQuery(e.target.value); setSelected(null); setPreview([]); setError('') }} className="mt-1 h-11 w-full rounded-2xl border border-[color:var(--bd-15)] bg-transparent px-3 text-sm" autoComplete="street-address" />
      {!!results.length && <div className="mt-2 max-h-48 overflow-auto rounded-2xl border border-[color:var(--bd-15)]">{results.map(a => <button key={a.addressId} onClick={() => choose(a)} className="block w-full border-b border-[color:var(--bd-10)] px-3 py-3 text-left text-sm last:border-0">{a.label}</button>)}</div>}
      {!!preview.length && <div className="mt-4"><div className="text-xs font-medium">{language === 'no' ? 'Neste hentedager' : 'Next collections'}</div>{preview.map(item => <div key={`${item.date}:${item.title}`} className="mt-2 flex justify-between text-sm"><span>{item.title}</span><span>{item.date}</span></div>)}</div>}
    </>}
    {error && <div className="mt-3 rounded-xl bg-[#d94b4b]/10 p-3 text-xs text-[#ff7a7a]">{error} <button onClick={() => errorKind === 'search' ? setSearchRetry(value => value + 1) : selected && choose(selected)} className="ml-1 underline">{language === 'no' ? 'Prøv igjen' : 'Retry'}</button></div>}
    <div className="mt-5 flex gap-2">{account ? <><button onClick={() => { setAccount(null); setQuery(''); setSelected(null) }} className="h-11 flex-1 rounded-2xl border border-[color:var(--bd-15)] text-xs">{language === 'no' ? 'ENDRE ADRESSE' : 'CHANGE ADDRESS'}</button><button onClick={disconnect} disabled={loading} className="h-11 flex-1 rounded-2xl border border-[#d94b4b]/40 text-xs text-[#d94b4b]">{language === 'no' ? 'KOBLE FRA' : 'DISCONNECT'}</button></> : <button onClick={save} disabled={loading || !selected || !preview.length} className="h-11 w-full rounded-2xl border border-[#2aa3ff] text-xs text-[#2aa3ff] disabled:opacity-40">{loading ? '…' : language === 'no' ? 'LAGRE' : 'SAVE'}</button>}</div>
  </div></div>
}
