const object = x => x && typeof x === 'object' && !Array.isArray(x) ? x : {}
const two = n => String(n).padStart(2,'0')
export const METHODS = [2,3,4,12,13]
export function safeCity(value) {
  const s=String(value??'').trim().replace(/\s+/g,' ')
  return s.length>=2 && s.length<=70 && /^[\p{L}\p{M} .'-]+$/u.test(s) ? s : null
}
export function validDate(s) {
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y,m,d]=s.split('-').map(Number)
  return y>=2000&&y<=2100&&new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)===s
}
export function prayerClock(value) {
  const m=String(value??'').trim().match(/^(\d{1,2}):(\d{2})(?:\s*\([A-Za-z0-9+:-]+\))?$/)
  return m&&Number(m[1])<=23&&Number(m[2])<=59?two(Number(m[1]))+':'+m[2]:null
}
export function aladhanUrl({city,date,asrMethod,method,highLatitude}) {
  if(!safeCity(city)||!validDate(date)||![1,2].includes(asrMethod)||!METHODS.includes(method)||![1,2,3].includes(highLatitude)) throw Error('Invalid AlAdhan preview parameters')
  const [y,m,d]=date.split('-')
  const u=new URL('https://api.aladhan.com/v1/timingsByCity/'+d+'-'+m+'-'+y)
  for(const [k,v] of Object.entries({city:safeCity(city),country:'NO',method,school:asrMethod===1?0:1,latitudeAdjustmentMethod:highLatitude,timezonestring:'Europe/Oslo'}))u.searchParams.set(k,String(v))
  return u
}

export function aladhanCoordinatesUrl({ latitude, longitude, date, asrMethod, method, highLatitude }) {
  if (!validDate(date) || ![1, 2].includes(asrMethod) ||
      !METHODS.includes(method) || ![1, 2, 3].includes(highLatitude) ||
      !Number.isFinite(latitude) || latitude < 57 || latitude > 82 ||
      !Number.isFinite(longitude) || longitude < 4 || longitude > 33) {
    throw Error('Invalid AlAdhan coordinates or calculation settings')
  }
  const [y, m, d] = date.split('-')
  const url = new URL('https://api.aladhan.com/v1/timings/' + d + '-' + m + '-' + y)
  for (const [key, value] of Object.entries({
    latitude, longitude, method, school: asrMethod === 1 ? 0 : 1,
    latitudeAdjustmentMethod: highLatitude, timezonestring: 'Europe/Oslo',
  })) url.searchParams.set(key, String(value))
  return url
}

export function normalizeAladhan(payload,{city,date,asrMethod,method,coordinates}) {
  const top=object(payload), data=object(top.data), meta=object(data.meta)
  if(Number(top.code)!==200)throw Error('Invalid AlAdhan response')
  const [y,m,d]=date.split('-')
  if(object(object(data.date).gregorian).date!==d+'-'+m+'-'+y)throw Error('AlAdhan date mismatch')
  if(meta.timezone!=='Europe/Oslo')throw Error('AlAdhan timezone mismatch')
  const info=object(meta.method)
  if(Number(info.id)!==method)throw Error('AlAdhan method mismatch')
  const school=String(meta.school??'').toUpperCase()
  if(asrMethod===1?!['STANDARD','SHAFI'].includes(school):school!=='HANAFI')throw Error('AlAdhan Asr mismatch')
  // City-name geocoding by AlAdhan sometimes returns no usable coordinates.
  // When supplied, rely on independently verified Norwegian coordinates.
  const lat=coordinates ? Number(coordinates.latitude) : Number(meta.latitude)
  const lon=coordinates ? Number(coordinates.longitude) : Number(meta.longitude)
  if(!Number.isFinite(lat)||lat<57||lat>82||!Number.isFinite(lon)||lon<4||lon>33)
    throw Error('City did not resolve in Norway')
  if (coordinates && meta.latitude != null && meta.longitude != null) {
    const actualLat=Number(meta.latitude), actualLon=Number(meta.longitude)
    if (Number.isFinite(actualLat) && Number.isFinite(actualLon) &&
        (Math.abs(actualLat-lat)>0.2 || Math.abs(actualLon-lon)>0.2))
      throw Error('Prayer coordinates do not match selected city')
  }
  const timings=object(data.timings)
  const names=['Fajr','Sunrise','Dhuhr','Asr','Sunset','Maghrib','Isha']
  const times=names.map(name=>({name,time:prayerClock(timings[name])}))
  if(times.some(x=>!x.time))throw Error('Incomplete or invalid prayer times')
  const hijri=object(object(data.date).hijri)
  return {provider:'AlAdhan',city,date,timeZone:'Europe/Oslo',
    method:{id:method,name:String(info.name??'').slice(0,100)},asrMethod,
    highLatitudeMethod:String(meta.latitudeAdjustmentMethod??'').slice(0,60),
    coordinates:{latitude:lat,longitude:lon},times,
    hijri:{date:String(hijri.date??'').slice(0,30),holidays:(Array.isArray(hijri.holidays)?hijri.holidays:[]).filter(x=>typeof x==='string').map(x=>x.slice(0,90)).slice(0,8)}}
}
