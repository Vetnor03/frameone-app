/**
 * Studio-only behavior contracts. These describe differences between modules;
 * they deliberately do not prescribe a universal composition algorithm.
 */
export const moduleResponsivePolicies = Object.freeze({
  date: policy('date',['text','visual'],'low',['fixed-system'],'never',['date','day'],['month','year','calendar','holiday'],'composition-scale'),
  reminders: policy('reminders',['text','list'],'high',['user-input','connected-service'],'ai-eligible-later',['title','time','day-context'],['source','additional-reminders','overflow-count'],'variable-list'),
  weather: policy('weather',['visual','metrics'],'bounded',['automated'],'never',['condition','temperature'],['wind','precipitation','low-high','insight','forecast'],'progressive-disclosure'),
  countdown: policy('countdown',['metrics','text'],'bounded',['user-input'],'ai-eligible-later',['count','unit'],['title','target-date'],'protect-dominant-figure'),
  surf: policy('surf',['visual','metrics'],'bounded',['automated'],'never',['rating','wave-height','spot'],['period','wind','directions','best-next-4h','trend'],'progressive-disclosure'),
  soccer: policy('soccer',['metrics','text'],'bounded',['automated'],'deterministic-only',['teams','score-kickoff'],['competition','position','previous-next-fixture'],'state-specific'),
  stocks: policy('stocks',['metrics','visual'],'bounded',['automated'],'never',['symbol','price','change'],['chart','range','additional-metrics'],'figure-first'),
  groceries: policy('groceries',['text','list'],'high',['user-input'],'ai-eligible-later',['items'],['item-count','sections','meal-planning','running-low'],'variable-list'),
})

function policy(module,contentNature,variability,sourceType,textCompression,priorities,optionalContent,composition) {
  return Object.freeze({module,contentNature,variability,sourceType,textCompression,priorities,optionalContent,composition})
}

export function moduleResponsivePolicy(module) {
  const value=moduleResponsivePolicies[module]
  if(!value) throw new RangeError(`Unknown responsive module policy: ${module}`)
  return value
}
