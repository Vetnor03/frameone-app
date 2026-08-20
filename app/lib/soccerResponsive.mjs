const knownCodes=[
  [/AFC Bournemouth|Bournemouth/i,'BOU'],[/Arsenal/i,'ARS'],[/Aston Villa/i,'AVL'],[/Brentford/i,'BRE'],[/Brighton(?: & Hove Albion)?/i,'BHA'],[/Burnley/i,'BUR'],[/Chelsea/i,'CHE'],[/Crystal Palace/i,'CRY'],[/Everton/i,'EVE'],[/Fulham/i,'FUL'],[/Leeds/i,'LEE'],[/Liverpool/i,'LIV'],[/Manchester City|Man City/i,'MCI'],[/Manchester United|Man Utd|Man United/i,'MUN'],[/Newcastle/i,'NEW'],[/Nottingham Forest/i,'NFO'],[/Sunderland/i,'SUN'],[/Tottenham(?: Hotspur)?/i,'TOT'],[/West Ham/i,'WHU'],[/Wolverhampton|Wolves/i,'WOL'],
]

export function soccerTeamAbbreviation(name){
  const value=String(name??'').trim();if(!value)return '---'
  const mapped=knownCodes.find(([pattern])=>pattern.test(value));if(mapped)return mapped[1]
  return (value.match(/[A-Za-z]/g)||[]).slice(0,3).join('').toUpperCase()||'---'
}

const table=(selectedPosition=1,count=8)=>Array.from({length:count},(_,i)=>({position:i+1,team:['Arsenal','Liverpool','Manchester City','Chelsea','Tottenham Hotspur','Newcastle United','Brighton & Hove Albion','Manchester United','Wolverhampton Wanderers','Fulham'][i%10],points:68-i*3,gap:i?i*3:null,goalDifference:20-i*3,selected:i+1===selectedPosition}))
const normal={teamName:'Arsenal',competitionName:'Premier League',nextFixture:{homeTeam:'Arsenal',awayTeam:'Liverpool',kickoffDay:'Sunday',kickoffTime:'16:30'},previousFixture:{homeTeam:'Arsenal',awayTeam:'Chelsea',homeScore:2,awayScore:1},position:1,points:68,table:table(),topScorer:{name:'Bukayo Saka',goals:18},record:{won:20,drawn:8,lost:4},goalsFor:68,goalsAgainst:31,goalDifference:37,form:'W W D W W'}
export const soccerStudioPresets={
  normal,
  long:{...normal,teamName:'Manchester United',competitionName:'English Premier League',nextFixture:{homeTeam:'Manchester United',awayTeam:'Wolverhampton Wanderers',kickoffDay:'Wednesday',kickoffTime:'20:45'},previousFixture:{homeTeam:'Manchester United',awayTeam:'Newcastle United',homeScore:1,awayScore:1},position:8,points:42,table:table(8,10)},
  extreme:{...normal,teamName:'Borussia Mönchengladbach',competitionName:'UEFA Champions League',nextFixture:{homeTeam:'Borussia Mönchengladbach',awayTeam:'Paris Saint-Germain',kickoffDay:'Saturday',kickoffTime:'23:59'},previousFixture:{homeTeam:'Borussia Mönchengladbach',awayTeam:'Paris Saint-Germain',homeScore:12,awayScore:10},position:99,points:999,table:Array.from({length:14},(_,i)=>({position:i+93,team:i===6?'Borussia Mönchengladbach':`Football Club ${i+1}`,points:999-i,gap:i||null,goalDifference:40-i,selected:i===6}))},
  empty:{teamName:null,competitionName:null,nextFixture:null,previousFixture:null,position:null,points:null,table:[],topScorer:null,record:null,goalsFor:null,goalsAgainst:null,goalDifference:null,form:null},
}

export function fitSoccerFact(value,width,height,measure,options={}){
  if(value==null||value===''||!(width>0)||!(height>0))return null
  const text=String(value);for(let fontSize=options.maxFont??18;fontSize>=(options.minFont??9);fontSize--)if(measure(text,fontSize)<=width&&fontSize*1.2<=height)return {text,fontSize}
  return null
}

export function soccerFixtureTeamLabels(fixture,width,measure,fontSize=18){
  if(!fixture)return null
  const full=`${fixture.homeTeam} vs ${fixture.awayTeam}`
  if(measure(full,fontSize)<=width)return {home:fixture.homeTeam,away:fixture.awayTeam,abbreviated:false}
  return {home:soccerTeamAbbreviation(fixture.homeTeam),away:soccerTeamAbbreviation(fixture.awayTeam),abbreviated:true}
}

export function soccerTableWindow(rows,maxRows){
  const list=Array.isArray(rows)?rows:[],count=Math.max(0,Math.min(list.length,Math.floor(maxRows)));if(!count)return []
  const selected=Math.max(0,list.findIndex(row=>row.selected));let start=Math.max(0,selected-Math.floor(count/2));start=Math.min(start,list.length-count);return list.slice(start,start+count)
}

export function soccerComposition(profile,state){
  const hasNext=Boolean(state.nextFixture),hasPrevious=Boolean(state.previousFixture),hasStanding=state.position!=null||state.points!=null,hasTable=Array.isArray(state.table)&&state.table.length>0,available=hasNext||hasPrevious||hasStanding||hasTable
  if(!available)return {family:'empty',available:false,primaryState:'empty',showStanding:false,showPrevious:false,showTable:false,tableColumns:[],tableRows:0,showDetails:false}
  const {width:w,height:h,orientation}=profile
  let family;if(w<230&&h<150)family='micro';else if(h<160)family='fixture-strip';else if(w<260)family='fixture-stack';else if(w>=560&&h>=300)family='fixture-standings';else if(h>=390&&w>=360)family='expanded';else family='fixture-history'
  const primaryState=hasNext?'next':hasPrevious?'previous':'standing'
  const tableWidth=family==='fixture-standings'?Math.min(w*.46,360):family==='expanded'?w-28:0
  const tableHeight=family==='fixture-standings'?h-28:family==='expanded'?Math.min(180,h*.38):0
  let tableColumns=[];if(hasTable&&tableHeight>=96){if(tableWidth>=300)tableColumns=['P','Team','Pts','Gap','GD'];else if(tableWidth>=235)tableColumns=['P','Team','Pts','GD'];else if(tableWidth>=180)tableColumns=['P','Team','Pts']}
  const tableRows=tableColumns.length?Math.min(state.table.length,Math.max(3,Math.floor((tableHeight-30)/22))):0
  return {family,available,primaryState,showStanding:hasStanding&&family!=='micro',showPrevious:hasPrevious&&hasNext&&['fixture-stack','fixture-history','fixture-standings','expanded'].includes(family)&&h>=250,showTable:tableRows>=3,tableColumns,tableRows,showDetails:family==='expanded'&&h>=420&&Boolean(state.competitionName||state.record||state.form||state.topScorer)}
}

const rect=(x,y,width,height)=>({x,y,width:Math.max(1,width),height:Math.max(1,height)})
export function soccerLayout(profile,composition){
  const {width:w,height:h}=profile,pad=Math.max(8,Math.min(14,w*.035)),gap=10
  const blank={emptyRect:null,primaryRect:null,kickoffRect:null,teamsRect:null,standingRect:null,previousRect:null,standingsRect:null,detailsRect:null,rowRects:[]}
  if(!composition.available)return {...blank,emptyRect:rect(pad,pad,w-pad*2,h-pad*2)}
  let primaryRect,standingsRect=null,detailsRect=null
  if(composition.showTable&&composition.family==='fixture-standings'){const sw=Math.min(w*.46,360);primaryRect=rect(pad,pad,w-pad*2-sw-gap,h-pad*2);standingsRect=rect(primaryRect.x+primaryRect.width+gap,pad,sw,h-pad*2)}
  else if(composition.showTable&&composition.family==='expanded'){const sh=Math.min(180,h*.38);standingsRect=rect(pad,h-pad-sh,w-pad*2,sh);primaryRect=rect(pad,pad,w-pad*2,standingsRect.y-pad-gap);if(composition.showDetails){const dw=Math.min(230,primaryRect.width*.36);detailsRect=rect(primaryRect.x+primaryRect.width-dw,primaryRect.y,dw,primaryRect.height);primaryRect=rect(primaryRect.x,primaryRect.y,primaryRect.width-dw-gap,primaryRect.height)}}
  else primaryRect=rect(pad,pad,w-pad*2,h-pad*2)
  const boundedH=Math.min(primaryRect.height,composition.family==='micro'?primaryRect.height:composition.family==='fixture-strip'?86:composition.showPrevious?250:170),groupY=primaryRect.y+(primaryRect.height-boundedH)/2
  let kickoffRect=null,teamsRect,standingRect=null,previousRect=null
  if(composition.family==='fixture-strip'){teamsRect=rect(primaryRect.x,groupY,primaryRect.width*.48,boundedH);kickoffRect=rect(primaryRect.x+primaryRect.width*.5,groupY,primaryRect.width*.22,boundedH);if(composition.showStanding)standingRect=rect(primaryRect.x+primaryRect.width*.74,groupY,primaryRect.width*.26,boundedH)}
  else if(composition.family==='micro')teamsRect=rect(primaryRect.x,groupY,primaryRect.width,boundedH)
  else {const kh=composition.primaryState==='next'?Math.min(36,boundedH*.2):0,th=Math.min(70,boundedH*.34);kickoffRect=kh?rect(primaryRect.x,groupY,primaryRect.width,kh):null;teamsRect=rect(primaryRect.x,groupY+kh,primaryRect.width,th);let y=groupY+kh+th+6;if(composition.showStanding){standingRect=rect(primaryRect.x,y,primaryRect.width,30);y+=36}if(composition.showPrevious)previousRect=rect(primaryRect.x,y+5,primaryRect.width,Math.min(92,groupY+boundedH-y-5))}
  const rowRects=[];if(standingsRect){const headerH=26,rowH=(standingsRect.height-headerH)/composition.tableRows;for(let i=0;i<composition.tableRows;i++)rowRects.push(rect(standingsRect.x,standingsRect.y+headerH+i*rowH,standingsRect.width,rowH))}
  return {...blank,primaryRect,kickoffRect,teamsRect,standingRect,previousRect,standingsRect,detailsRect,rowRects}
}
