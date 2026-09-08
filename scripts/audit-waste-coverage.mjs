#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const snapshotPath = path.join(root, 'scripts/data/norway-municipalities-2026.json')
const registryPath = path.join(root, 'app/lib/integrations/waste/providers.ts')
const docsPath = path.join(root, 'docs/waste/NORWAY_COVERAGE.md')
export const STATUSES = ['supported', 'preview', 'adapter_exists_missing_registry', 'known_provider_no_adapter', 'credential_blocked', 'auth_gated', 'unknown_provider']

const evidence = {
  ssb: 'https://www.ssb.no/klass/klassifikasjoner/131',
  upstream: 'https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source',
  him: 'https://him.as/om-him/', bir: 'https://bir.no/om-bir/selskaper-og-eiere/', remidt: 'https://remidt.no/om-remidt/', fosen: 'https://fosenrenovasjon.no/om-oss/',
  karmoy: 'https://www.karmoy.kommune.no/innbygger/teknisk-og-eiendom/renovasjon-og-avfall/tommekalender/',
}
const groups = [
  { nums: ['1145','4611','1146','1160'], brand:'HIM', family:'him', status:'adapter_exists_missing_registry', confidence:'High-confidence: same statutory provider and existing HIM address/calendar contract.', url:evidence.him },
  { nums: ['5020'], brand:'Fosen Renovasjon', family:'renovasjonsportal', status:'adapter_exists_missing_registry', confidence:'High-confidence registry expansion candidate; validate an Osen address before routing.', url:evidence.fosen },
  { nums: ['5014','5021','5022','5027','5028','5029','5026','5056','5061','1505','1560','1563','1566','1573','1576'], brand:'ReMidt', family:'renovasjonsportal', status:'adapter_exists_missing_registry', confidence:'Existing provider-family adapter; municipality/property acceptance still requires live validation.', url:evidence.remidt },
  { nums:['4601','4619','4620','4621','4622','4623','4624','4627','4628','4630'], brand:'BIR', family:'bir', status:'known_provider_no_adapter', confidence:'BIR statutory household-waste municipalities; upstream adapter exists. Øygarden intentionally excluded.', url:'https://bir.no/om-bir/selskaper-og-eiere/' },
  { nums:['4204','4223'], brand:'Avfall Sør', family:'avfallsor', status:'known_provider_no_adapter', url:'https://avfallsor.no/om-avfall-sor/' },
  { nums:['3107'], brand:'Fredrikstad kommune', family:'fredrikstad', status:'known_provider_no_adapter', url:'https://www.fredrikstad.kommune.no/tjenester/avfall/' },
  { nums:['3405','3440','3441'], brand:'GLØR', family:'glor', status:'known_provider_no_adapter', url:'https://glor.no/om-glor/' },
  { nums:['5031','5032','5033','5034','5035','5036','5037','5038','5053'], brand:'Innherred Renovasjon', family:'innherred', status:'known_provider_no_adapter', url:'https://innherredrenovasjon.no/om-oss/' },
  { nums:['1804','1837','1838','1839','1840','1841','1845','1848','1875'], brand:'Iris Salten', family:'iris_salten', status:'known_provider_no_adapter', url:'https://iris-salten.no/om-iris/' },
  { nums:['3103','3112','3114','3216'], brand:'MOVAR', family:'movar', status:'known_provider_no_adapter', url:'https://movar.no/renovasjon/' },
  { nums:['3301','3312','3314','3316','3318','3332'], brand:'Renovasjonsselskapet for Drammensregionen', family:'rfd', status:'known_provider_no_adapter', url:'https://www.rfd.no/om-rfd' },
  { nums:['1506','1539','1557','1579'], brand:'Romsdalshalvøya Interkommunale Renovasjonsselskap', family:'rir', status:'known_provider_no_adapter', url:'https://www.rir.no/om-rir' },
  { nums:['4645','4646','4647','4637'], brand:'SUM', family:'sum', status:'known_provider_no_adapter', url:'https://www.sumavfall.no/om-oss' },
  { nums:['5001'], brand:'Trondheim Renholdsverk', family:'trondheim', status:'known_provider_no_adapter', url:'https://trv.no/om-oss/' },
]

export function loadMunicipalities(file = snapshotPath) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(rows) || rows.length !== 357) throw new Error(`Official municipality snapshot must contain exactly 357 rows (got ${rows?.length ?? 'non-array'})`)
  const numbers = new Set(rows.map(row => row.municipality_number))
  if (numbers.size !== rows.length) throw new Error('Official municipality snapshot contains duplicate municipality numbers')
  for (const row of rows) for (const key of ['municipality_number','municipality_name','county_number','county_name','source','source_snapshot_date']) if (!row[key]) throw new Error(`Snapshot row ${row.municipality_number || '?'} lacks ${key}`)
  return rows
}

// Parse only the typed registry array. This keeps the audit executable in plain Node
// without importing application TypeScript or changing production exports.
export function loadRegistry(file = registryPath) {
  const source = fs.readFileSync(file, 'utf8')
  const block = source.match(/WASTE_PROVIDER_REGISTRY[^=]*=\s*\[([\s\S]*?)\]\s*as const/)?.[1]
  if (!block) throw new Error('Could not locate WASTE_PROVIDER_REGISTRY')
  return [...block.matchAll(/\{([^{}]+)\}/g)].map(match => Object.fromEntries([...match[1].matchAll(/(municipalityNumber|municipalityName|family|brand|status):\s*'([^']*)'/g)].map(value => [value[1], value[2]]))).filter(row => row.municipalityNumber)
}

export function buildAudit(municipalities = loadMunicipalities(), registry = loadRegistry()) {
  const official = new Map(municipalities.map(row => [row.municipality_number, row]))
  const duplicateRegistry = registry.find((row, i) => registry.findIndex(other => other.municipalityNumber === row.municipalityNumber) !== i)
  if (duplicateRegistry) throw new Error(`Duplicate registry municipality ${duplicateRegistry.municipalityNumber}`)
  for (const row of registry) if (!official.has(row.municipalityNumber)) throw new Error(`Registry contains unknown/obsolete municipality ${row.municipalityNumber}`)
  const overlays = new Map()
  for (const group of groups) for (const number of group.nums) {
    if (!official.has(number)) throw new Error(`Research mapping contains unknown municipality ${number}`)
    if (overlays.has(number)) throw new Error(`Research mapping duplicates municipality ${number}`)
    overlays.set(number, group)
  }
  return municipalities.map(municipality => {
    const registered = registry.find(row => row.municipalityNumber === municipality.municipality_number)
    const special = municipality.municipality_number === '1149' ? {brand:'Karmøy kommune',family:'authenticated_self_service',status:'auth_gated',url:evidence.karmoy,confidence:'Calendar is exposed through authenticated self-service; no login bypass was attempted.'} : undefined
    const overlay = special || overlays.get(municipality.municipality_number)
    let coverage_status = registered?.status || overlay?.status || 'unknown_provider'
    let live_verification_status = 'not_tested'
    if (registered?.family === 'minrenovasjon') { coverage_status = 'credential_blocked'; live_verification_status = 'credential_not_configured' }
    return {
      municipality_number: municipality.municipality_number, municipality_name: municipality.municipality_name,
      county: municipality.county_name, provider_brand: registered?.brand || overlay?.brand || '',
      provider_family: registered?.family || overlay?.family || '', registry_status: registered?.status || 'unmapped', coverage_status,
      adapter_status: registered ? (registered.family === 'norconsult_unresolved' ? 'parser_known_resolution_missing' : 'implemented') : overlay?.status === 'adapter_exists_missing_registry' ? 'implemented_unmapped' : overlay ? 'not_implemented' : 'unknown',
      live_verification_status, evidence: registered ? evidence.upstream : overlay?.url || '', notes: overlay?.confidence || (registered?.family === 'norconsult_unresolved' ? 'Provider calendar parser known; automatic Kartverket-to-property-ID resolution unresolved.' : '')
    }
  })
}
export function totals(rows) { return Object.fromEntries(STATUSES.map(status => [status, rows.filter(row => row.coverage_status === status).length])) }
export function renderMatrix(rows) {
  const header='| Municipality | County | Provider / family | Registry | Coverage | Adapter | Live verification | Evidence / notes |\n|---|---|---|---|---|---|---|---|'
  return [header,...rows.map(r=>`| ${r.municipality_number} ${r.municipality_name} | ${r.county} | ${r.provider_brand}${r.provider_family ? ` / \`${r.provider_family}\``:''} | ${r.registry_status} | \`${r.coverage_status}\` | ${r.adapter_status} | ${r.live_verification_status} | ${r.evidence ? `[source](${r.evidence})`:''}${r.notes ? ` ${r.notes}`:''} |`)].join('\n')
}
export function updateDocumentation(rows, file = docsPath) {
  const text=fs.readFileSync(file,'utf8'), matrix=renderMatrix(rows)
  fs.writeFileSync(file,text.replace(/<!-- AUDIT_MATRIX_START -->[\s\S]*<!-- AUDIT_MATRIX_END -->/,`<!-- AUDIT_MATRIX_START -->\n${matrix}\n<!-- AUDIT_MATRIX_END -->`))
}
export function main(args=process.argv.slice(2)) {
  const municipalities=loadMunicipalities(), registry=loadRegistry(), rows=buildAudit(municipalities,registry), count=totals(rows)
  console.log(`Exact total: ${rows.length}`); console.log(`Registry supported: ${registry.filter(r=>r.status==='supported').length}`); console.log(`Registry preview: ${registry.filter(r=>r.status==='preview').length}`)
  for (const status of STATUSES) console.log(`${status}: ${count[status]}`)
  console.log('\nUnmapped municipalities:')
  for (const row of rows.filter(row=>row.registry_status==='unmapped')) console.log(`${row.municipality_number}\t${row.municipality_name}\t${row.coverage_status}\t${row.provider_brand || 'unknown'}`)
  if (args.includes('--write-docs')) { updateDocumentation(rows); console.log(`\nUpdated ${path.relative(root,docsPath)}`) }
  return {rows,registry,count}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
