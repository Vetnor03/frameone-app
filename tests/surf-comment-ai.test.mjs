import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
register('./typescript-test-loader.mjs', import.meta.url)
const { validateSurfCommentAnalysis, SURF_COMMENT_ANALYSIS_VERSION } = await import('../app/lib/surf/commentAnalysis.ts')
const { scoreSurf, MAX_SHARED_ADJUSTMENT, MAX_PERSONAL_ADJUSTMENT } = await import('../app/lib/surfScoring.ts')

const valid = { summary: 'Wind hurt the session.', confidence: .9, drivers: [{ dimension: 'wind_speed', effect: 'worse', strength: .9 }], observations: { forecast_size_relation: null, surface_quality: 'messy', consistency: null, wind_effect: 'hurt', multi_swell_effect: null } }
const now = new Date().toISOString()
const current = { spotKey: 'Bore', swellHeightM: 1.2, swellPeriodS: 10, swellDirDeg: 280, windSpeedMs: 3, windDirDeg: 100 }
function row(i, overrides={}) { return { id:`r${i}`, user_id:`u${i%4}`, spot_id:'bore', logged_at:now, wave_height_m:1.2, wave_period_s:10, wave_dir_from_deg:280, wind_speed_ms:3, wind_dir_from_deg:100, rating_1_6:6, calibration_scope:'shared', ...overrides } }

test('strict comment parser accepts observations but rejects scoring and invalid ranges', () => {
  assert.deepEqual(validateSurfCommentAnalysis(valid), valid)
  assert.equal(validateSurfCommentAnalysis({ ...valid, score: 6 }), null)
  assert.equal(validateSurfCommentAnalysis({ ...valid, confidence: 2 }), null)
  assert.equal(validateSurfCommentAnalysis({ ...valid, drivers:[{dimension:'rating',effect:'better',strength:1}] }), null)
  assert.equal(SURF_COMMENT_ANALYSIS_VERSION, 'surf-comment-v1')
})

test('no comment and legacy rows preserve calibration byte-for-byte', () => {
  const rows=Array.from({length:12},(_,i)=>row(i))
  assert.deepEqual(scoreSurf({...current,userExperiences:rows}), scoreSurf({...current,userExperiences:rows.map(x=>({...x,comment_ai_analysis:null,comment_ai_version:null}))}))
})

test('low confidence is stored-compatible but does not weight drivers', () => {
  const rows=Array.from({length:12},(_,i)=>row(i,{comment_ai_analysis:{...valid,confidence:.54},comment_ai_version:'surf-comment-v1'}))
  const c=scoreSurf({...current,userExperiences:rows}).breakdown.calibration
  assert.equal(c.aiEnrichedSampleCount,12); assert.equal(c.aiDriverWeightedSampleCount,0)
})

test('high confidence wind, period, and multi-swell drivers weight matching without bypassing caps', () => {
  for (const dimension of ['wind_speed','wave_period','multi_swell']) {
    const rows=Array.from({length:12},(_,i)=>row(i,{comment_ai_analysis:{...valid,drivers:[{dimension,effect:'worse',strength:1}]},comment_ai_version:'surf-comment-v1'}))
    const c=scoreSurf({...current,userExperiences:rows}).breakdown.calibration
    assert.equal(c.aiDriverWeightedSampleCount,12); assert.ok(Math.abs(c.sharedAdjustment)<=MAX_SHARED_ADJUSTMENT)
    assert.ok(Math.abs(c.personalAdjustment)<=MAX_PERSONAL_ADJUSTMENT)
  }
})

test('wind-only driver does not weaken the existing multi-swell mismatch penalty', () => {
  const signature={ spotKey:'Bore', swells:[1,2,3].map(index=>({index,height_m:1.2,period_s:10,direction_deg_from:280})), wind_speed_ms:3, wind_direction_deg_from:100 }
  const baseRows=Array.from({length:12},(_,i)=>row(i,{condition_signature:signature}))
  const windRows=baseRows.map(x=>({...x,comment_ai_analysis:valid,comment_ai_version:'surf-comment-v1'}))
  const baseline=scoreSurf({...current,userExperiences:baseRows}).breakdown.calibration
  const windWeighted=scoreSurf({...current,userExperiences:windRows}).breakdown.calibration
  assert.equal(windWeighted.sharedAdjustment,baseline.sharedAdjustment)
  assert.equal(windWeighted.sharedSampleCount,baseline.sharedSampleCount)
})

test('logging is fail-soft, sends no identity, and forecast scoring never invokes OpenAI', () => {
  const route=readFileSync(new URL('../app/api/surf/experience/log/route.ts',import.meta.url),'utf8')
  const helper=readFileSync(new URL('../app/lib/surf/commentAnalysis.ts',import.meta.url),'utf8')
  const scoreRoute=readFileSync(new URL('../app/api/surf/score/route.ts',import.meta.url),'utf8')
  assert.match(route,/if \(commentChanged && comment\) after\(\(\) => analyzeAndStore\(updated\.id\)\)/)
  assert.match(route,/if \(comment\) after\(\(\) => analyzeAndStore\(inserted\.id\)\)/)
  assert.doesNotMatch(route,/await analyzeAndStore/)
  assert.match(route,/comment_ai_analysis: null/)
  assert.doesNotMatch(helper,/user[_ ]?id|email|access.?token/i)
  assert.doesNotMatch(scoreRoute,/analyzeSurfComment|api\.openai\.com/)
  assert.doesNotMatch(route,/console\.(log|info|warn|error)/)
})

test('experience response is separated from post-response AI latency or failure', () => {
  const route=readFileSync(new URL('../app/api/surf/experience/log/route.ts',import.meta.url),'utf8')
  assert.match(route,/import \{ after, NextResponse \} from 'next\/server'/)
  assert.ok(route.indexOf("if (comment) after(() => analyzeAndStore(inserted.id))") < route.indexOf("return NextResponse.json({\n      ok: true,\n      mode: 'insert'"))
})
