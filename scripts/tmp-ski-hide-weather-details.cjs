const fs = require('fs')
const path = 'app/HomePageClient.tsx'
let source = fs.readFileSync(path, 'utf8')

const signatureBefore = `function WeatherLocationRow({\n  language,\n  id,\n  title,\n  label,\n  cfg,\n  onPicked,`
const signatureAfter = `function WeatherLocationRow({\n  language,\n  id,\n  title,\n  label,\n  cfg,\n  showDetails = true,\n  onPicked,`
if (!source.includes(signatureBefore)) throw new Error('WeatherLocationRow signature not found')
source = source.replace(signatureBefore, signatureAfter)

const typeBefore = `  cfg: WeatherLocationCfg | null\n  onPicked: (cfgPatch: any) => void`
const typeAfter = `  cfg: WeatherLocationCfg | null\n  showDetails?: boolean\n  onPicked: (cfgPatch: any) => void`
if (!source.includes(typeBefore)) throw new Error('WeatherLocationRow props type not found')
source = source.replace(typeBefore, typeAfter)

const detailsBefore = `{cfg && Number.isFinite(Number(cfg.lat)) && Number.isFinite(Number(cfg.lon)) && (\n        <WeatherDetailsCard language={language} cfg={cfg} />\n      )}`
const detailsAfter = `{showDetails && cfg && Number.isFinite(Number(cfg.lat)) && Number.isFinite(Number(cfg.lon)) && (\n        <WeatherDetailsCard language={language} cfg={cfg} />\n      )}`
if (!source.includes(detailsBefore)) throw new Error('WeatherDetailsCard condition not found')
source = source.replace(detailsBefore, detailsAfter)

const skiStart = source.indexOf('function SkiModuleSettingsTab(')
if (skiStart < 0) throw new Error('SkiModuleSettingsTab not found')
const skiCall = source.indexOf('        <WeatherLocationRow', skiStart)
if (skiCall < 0) throw new Error('Ski WeatherLocationRow call not found')
const skiCallEnd = source.indexOf('        />', skiCall)
if (skiCallEnd < 0) throw new Error('Ski WeatherLocationRow end not found')
const skiBlock = source.slice(skiCall, skiCallEnd)
if (!skiBlock.includes('          cfg={cfg}\n')) throw new Error('Ski cfg prop not found')
const nextSkiBlock = skiBlock.replace('          cfg={cfg}\n', '          cfg={cfg}\n          showDetails={false}\n')
source = source.slice(0, skiCall) + nextSkiBlock + source.slice(skiCallEnd)

fs.writeFileSync(path, source)
