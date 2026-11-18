'use client'
import { useRef, useState } from 'react'
import AppSheet from './AppSheet'
import { supabase } from '@/app/lib/supabase'
import type { AladhanPreview } from '@/app/lib/integrations/aladhan/preview.mjs'

const methods=[
  {id:3,name:'Muslim World League'}, {id:13,name:'Diyanet (Tyrkia)'},
  {id:12,name:'UOIF (Frankrike)'}, {id:2,name:'ISNA'}, {id:4,name:'Umm Al-Qura'},
]
const highLat=[
  {id:3,no:'Vinkelbasert',en:'Angle based'}, {id:1,no:'Halvparten av natten',en:'Middle of the night'},
  {id:2,no:'En syvendedel av natten',en:'One seventh of the night'},
]
const translated:Record<string,{no:string;en:string}>={
  Fajr:{no:'Fajr',en:'Fajr'},Sunrise:{no:'Soloppgang',en:'Sunrise'},
  Dhuhr:{no:'Dhuhr',en:'Dhuhr'},Asr:{no:'Asr',en:'Asr'},
  Sunset:{no:'Solnedgang',en:'Sunset'},Maghrib:{no:'Maghrib',en:'Maghrib'},
  Isha:{no:'Isha',en:'Isha'},
}
export default function AladhanPreviewModal({language,onClose}:{language:'no'|'en';onClose:()=>void}) {
  const [city,setCity]=useState('Stavanger')
  const [date,setDate]=useState(()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Oslo'}))
  const [asr,setAsr]=useState<1|2>(1)
  const [method,setMethod]=useState(3)
  const [highLatitude,setHighLatitude]=useState(3)
  const [result,setResult]=useState<AladhanPreview|null>(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const current=useRef(0)
  function clear(){current.current++;setResult(null);setError('');setLoading(false)}
  async function preview(){
    if(loading||city.trim().length<2||!date)return
    const req=++current.current
    setLoading(true);setResult(null);setError('')
    try{
      const token=(await supabase.auth.getSession()).data.session?.access_token
      if(!token)throw Error(language==='no'?'Du må logge inn.':'Sign in required.')
      const qs=new URLSearchParams({city:city.trim(),date,asrMethod:String(asr),method:String(method),highLatitude:String(highLatitude)})
      const response=await fetch('/api/integrations/aladhan/preview?'+qs.toString(),{headers:{Authorization:'Bearer '+token},cache:'no-store'})
      const json=await response.json()
      if(!response.ok)throw Error(json.error||'AlAdhan unavailable')
      if(req===current.current)setResult(json as AladhanPreview)
    }catch(e){if(req===current.current)setError(e instanceof Error?e.message:'AlAdhan unavailable')}
    finally{if(req===current.current)setLoading(false)}
  }
  const input='mt-1 h-11 w-full rounded-2xl border border-[color:var(--bd-15)] bg-[color:var(--sheet-bg)] px-3 text-base text-[color:var(--fg-90)]'
  const label='block text-[10px] tracking-widest text-[color:var(--fg-45)]'
  return <AppSheet title={language==='no'?'AlAdhan · test':'AlAdhan · preview'} onClose={()=>{clear();onClose()}}
    footer={<button type="button" onClick={()=>void preview()} disabled={loading||city.trim().length<2||!date} className="h-11 w-full rounded-2xl border border-[#2aa3ff] text-xs tracking-widest text-[#2aa3ff] disabled:opacity-40">{loading?'HENTER…':language==='no'?'HENT BØNNETIDER':'PREVIEW TIMES'}</button>}>
    <p className="text-sm leading-relaxed text-[color:var(--fg-70)]">{language==='no'
      ?'Test beregnede bønnetider uten API-nøkkel. Dette er ikke offisielle IRN-tider. Ingenting lagres i Påminnelser eller på rammen.'
      :'Preview calculated prayer times without an API key. Not official IRN times. Nothing is saved to Reminders or the frame.'}</p>
    <label htmlFor="aladhan-city" className={'mt-4 '+label}>{language==='no'?'BY I NORGE':'CITY IN NORWAY'}</label>
    <input id="aladhan-city" className={input} value={city} onChange={e=>{clear();setCity(e.target.value)}} placeholder="Stavanger"/>
    <label htmlFor="aladhan-date" className={'mt-4 '+label}>{language==='no'?'DATO':'DATE'}</label>
    <input id="aladhan-date" type="date" className={input} value={date} onChange={e=>{clear();setDate(e.target.value)}}/>
    <fieldset className="mt-4"><legend className={label}>ASR</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">{([1,2] as const).map(value=><label key={value}
        className={'flex items-center gap-2 rounded-2xl border px-3 py-3 text-sm '+(asr===value?'border-[#2aa3ff] text-[#2aa3ff]':'border-[color:var(--bd-15)] text-[color:var(--fg-70)]')}>
        <input type="radio" name="aladhan-asr" checked={asr===value} onChange={()=>{clear();setAsr(value)}}/>{value}x
      </label>)}</div></fieldset>
    <label htmlFor="aladhan-method" className={'mt-4 '+label}>{language==='no'?'BEREGNINGSMETODE':'CALCULATION METHOD'}</label>
    <select id="aladhan-method" className={input} value={method} onChange={e=>{clear();setMethod(Number(e.target.value))}}>
      {methods.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    <label htmlFor="aladhan-high-lat" className={'mt-4 '+label}>{language==='no'?'HØYE BREDDEGRADER':'HIGH LATITUDE ADJUSTMENT'}</label>
    <select id="aladhan-high-lat" className={input} value={highLatitude} onChange={e=>{clear();setHighLatitude(Number(e.target.value))}}>
      {highLat.map(item=><option key={item.id} value={item.id}>{item[language]}</option>)}
    </select>
    {error&&<p role="alert" className="mt-4 rounded-xl border border-[#d94b4b]/30 p-3 text-xs text-[#ff7a7a]">{error}</p>}
    {result&&<div className="mt-5 rounded-2xl border border-[color:var(--bd-15)] p-4">
      <div className="text-sm font-semibold text-[color:var(--fg-90)]">{result.city} · {result.date}</div>
      <p className="mt-1 text-xs text-[color:var(--fg-45)]">{result.method.name} · Asr {result.asrMethod}x · {result.timeZone}</p>
      <div className="mt-4 space-y-2">{result.times.map(item=><div key={item.name} className="flex justify-between border-b border-[color:var(--bd-10)] pb-2 text-sm text-[color:var(--fg-90)]">
        <span>{translated[item.name]?.[language]||item.name}</span><span className="font-semibold tabular-nums">{item.time}</span>
      </div>)}</div>
      <p className="mt-3 text-xs text-[color:var(--fg-45)]">{language==='no'?'Beregnet sted':'Resolved location'}: {result.coordinates.latitude.toFixed(3)}, {result.coordinates.longitude.toFixed(3)}</p>
      {result.hijri.date&&<p className="mt-2 text-xs text-[color:var(--fg-60)]">Hijri: {result.hijri.date}</p>}
      {!!result.hijri.holidays.length&&<p className="mt-2 text-xs text-[color:var(--fg-70)]">{language==='no'?'Beregnet kalendermerking':'Calculated calendar labels'}: {result.hijri.holidays.join(', ')}</p>}
    </div>}
    <p className="mt-4 text-xs leading-relaxed text-[color:var(--fg-45)]">{language==='no'
      ?'Tidene kan avvike fra IRN og lokale moskeer, særlig ved høye breddegrader. Kommersiell bruksrett må avklares før lansering.'
      :'Times may differ from IRN and local mosques, especially at high latitudes. Commercial rights must be checked before launch.'}</p>
  </AppSheet>
}
