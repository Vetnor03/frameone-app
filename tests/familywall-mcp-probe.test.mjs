import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { FAMILYWALL_RESOURCE, trustedEndpoint, startFamilyWallProbe, exchangeProbeCode, discoverFamilyWallTools, runFamilyWallReadProbe, readFamilyWallCalendar, exchangeFamilyWallCode, refreshFamilyWallToken } from '../app/lib/integrations/familywall/probe.ts'

const origin = 'https://mcp.familywall.com'
const settings = { redirectUri: 'https://example.test/api/integrations/familywall/probe', trustedOrigins: [] }
const json = (value, headers = {}) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', ...headers } })

test('FamilyWall OAuth endpoints are restricted to exact HTTPS origins', () => {
  for (const url of ['http://mcp.familywall.com/token','https://mcp.familywall.com.evil.test/token','https://127.0.0.1/token','https://user@mcp.familywall.com/token','https://mcp.familywall.com/token#x']) {
    assert.throws(() => trustedEndpoint(url,[origin]))
  }
  assert.equal(trustedEndpoint(origin + '/token',[origin]),origin + '/token')
})

test('FamilyWall OAuth discovery uses PKCE, resource binding, and public registration', async () => {
  const requests = []
  const fetcher = async (url, init) => {
    requests.push([url,init])
    assert.equal(init.redirect,'error')
    if (url.endsWith('/oauth-protected-resource/mcp')) return json({resource:FAMILYWALL_RESOURCE,authorization_servers:[origin]})
    if (url.endsWith('/oauth-authorization-server')) return json({issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',registration_endpoint:origin+'/register',code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']})
    if (url.endsWith('/register')) {
      const body=JSON.parse(init.body)
      assert.deepEqual(body.redirect_uris,[settings.redirectUri])
      assert.equal(body.token_endpoint_auth_method,'none')
      return json({client_id:'test-client'})
    }
    if (url.endsWith('/token')) {
      assert.equal(init.body.get('resource'),FAMILYWALL_RESOURCE)
      assert.equal(init.body.get('code'),'test-code')
      assert.equal(init.body.get('client_id'),'test-client')
      return json({token_type:'Bearer',access_token:'test-token'})
    }
    throw Error('unexpected URL')
  }
  const {url,pending}=await startFamilyWallProbe(settings,fetcher)
  const params=new URL(url).searchParams
  assert.equal(params.get('state'),pending.state)
  assert.equal(params.get('resource'),FAMILYWALL_RESOURCE)
  assert.equal(params.get('code_challenge_method'),'S256')
  assert.equal(params.get('code_challenge'),createHash('sha256').update(pending.verifier).digest('base64url'))
  assert.equal(await exchangeProbeCode(pending,'test-code',[],fetcher),'test-token')
  assert.equal(requests.length,4)
})

test('FamilyWall rejects an unverified issuer before sending any OAuth credentials', async () => {
  let calls=0
  await assert.rejects(startFamilyWallProbe(settings,async ()=>{
    calls++
    return json({resource:FAMILYWALL_RESOURCE,authorization_servers:['https://untrusted.test']})
  }),/Unapproved/)
  assert.equal(calls,1)
})

test('FamilyWall MCP discovery negotiates the session and only lists tools, never executes them', async () => {
  const calls=[]
  const fetcher=async (url,init)=>{
    assert.equal(url,FAMILYWALL_RESOURCE)
    assert.equal(init.headers.Authorization,'Bearer test-token')
    if(init.method==='DELETE'){
      calls.push('DELETE')
      assert.equal(init.headers['Mcp-Session-Id'],'session')
      return new Response(null,{status:204})
    }
    const body=JSON.parse(init.body)
    calls.push(body.method)
    if(body.method==='initialize') return json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-06-18'}},{'Mcp-Session-Id':'session'})
    assert.equal(init.headers['Mcp-Session-Id'],'session')
    if(body.method==='notifications/initialized') return new Response(null,{status:202})
    if(body.method==='tools/list') {
      const result={jsonrpc:'2.0',id:body.id,result:{tools:[{name:'example_list',inputSchema:{type:'object'},annotations:{readOnlyHint:true}}]}}
      return new Response('event: message\ndata: '+JSON.stringify(result)+'\n\n',{headers:{'Content-Type':'text/event-stream'}})
    }
    throw Error('Unexpected tool call')
  }
  assert.deepEqual(await discoverFamilyWallTools('test-token',fetcher),[{name:'example_list',readOnlyHint:true,inputSchema:{type:'object'}}])
  assert.deepEqual(calls,['initialize','notifications/initialized','tools/list','DELETE'])
})

test('FamilyWall read probe uses only explicit read tools and never returns personal values or unknown keys', async () => {
  const calls=[]
  const fetcher=async (url,init)=>{
    if(init.method==='DELETE') return new Response(null,{status:204})
    const body=JSON.parse(init.body)
    if(body.method==='initialize') return json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-06-18'}},{'Mcp-Session-Id':'session'})
    if(body.method==='notifications/initialized') return new Response(null,{status:202})
    if(body.method==='tools/list') return json({jsonrpc:'2.0',id:body.id,result:{tools:['list_events','list_lists','list_items','delete_event'].map(name=>({name,inputSchema:{type:'object'},annotations:{readOnlyHint:true}}))}})
    if(body.method==='tools/call') {
      const {name,arguments:args}=body.params
      calls.push([name,args])
      const value=name==='list_events'?{events:[{title:'Private appointment',start_date:'2026-11-25',PrivateDynamicKey:'secret'}]}:name==='list_lists'?{lists:[{id:'taskList/19966_7213',name:'Private shopping'}]}:{items:[{name:'Private item',checked:false}]}
      return json({jsonrpc:'2.0',id:body.id,result:{content:[{type:'text',text:JSON.stringify(value)}]}})
    }
    throw Error('Unexpected method')
  }
  const result=await runFamilyWallReadProbe('test-token',fetcher)
  assert.deepEqual(calls,[['list_events',{days:7}],['list_lists',{}],['list_items',{list_id:'taskList/19966_7213',include_done:false}]])
  assert.deepEqual(result.map(x=>x.status),['ok','ok','ok'])
  assert.match(result[0].shape,/events.*title:string/)
  assert.doesNotMatch(JSON.stringify(result),/Private|secret|19966|2026-11-25/)
})

test('FamilyWall read probe refuses tools without the read-only annotation', async () => {
  const fetcher=async (url,init)=>{
    const body=JSON.parse(init.body)
    if(body.method==='initialize') return json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-06-18'}})
    if(body.method==='notifications/initialized') return new Response(null,{status:202})
    if(body.method==='tools/list') return json({jsonrpc:'2.0',id:body.id,result:{tools:[{name:'list_events',inputSchema:{type:'object'},annotations:{readOnlyHint:false}}]}})
    assert.fail('No tool should be executed')
  }
  assert.deepEqual((await runFamilyWallReadProbe('test-token',fetcher)).map(x=>x.status),['unavailable','unavailable','skipped'])
})

test('FamilyWall calendar import invokes the confirmed read-only event tool', async () => {
  const calls=[]
  const fetcher=async (url,init)=>{
    const body=JSON.parse(init.body)
    if(body.method==='initialize') return json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-06-18'}})
    if(body.method==='notifications/initialized') return new Response(null,{status:202})
    if(body.method==='tools/list') return json({jsonrpc:'2.0',id:body.id,result:{tools:[{name:'list_events',inputSchema:{type:'object'},annotations:{readOnlyHint:true}},{name:'delete_event',inputSchema:{type:'object'},annotations:{readOnlyHint:false}}]}})
    calls.push(body.params)
    return json({jsonrpc:'2.0',id:body.id,result:{structuredContent:{events:[{id:'event/1',title:'Appointment',start:'2026-11-26T12:00:00+01:00'}]}}})
  }
  const result=await readFamilyWallCalendar('test-token',fetcher)
  assert.equal(result.events[0].title,'Appointment')
  assert.deepEqual(calls,[{name:'list_events',arguments:{days:62}}])
})

test('FamilyWall token exchange retains expiry and refresh token only on the server', async () => {
  const pending={clientId:'client',tokenEndpoint:origin+'/token',redirectUri:settings.redirectUri,verifier:'verifier'}
  const fetcher=async (url,init)=>{
    assert.equal(url,origin+'/token')
    assert.equal(init.body.get('client_id'),'client')
    return json({token_type:'Bearer',access_token:'access',refresh_token:'refresh',expires_in:3600})
  }
  const token=await exchangeFamilyWallCode(pending,'code',[],fetcher)
  assert.equal(token.refresh_token,'refresh')
  assert.ok(token.expires_at>Date.now())
  const refreshed=await refreshFamilyWallToken('client',origin+'/token',token,[],async (url,init)=>{
    assert.equal(init.body.get('grant_type'),'refresh_token')
    assert.equal(init.body.get('refresh_token'),'refresh')
    return json({token_type:'Bearer',access_token:'new-access',expires_in:3600})
  })
  assert.equal(refreshed.access_token,'new-access')
  assert.equal(refreshed.refresh_token,'refresh')
})

test('FamilyWall calendar combines every JSON text block and follows advertised pagination', async () => {
  const calls=[]
  const event=n=>({id:'event/'+n,title:'Event '+n,start:'2026-11-26T12:00:00+01:00'})
  const fetcher=async (url,init)=>{
    const body=JSON.parse(init.body)
    if(body.method==='initialize') return json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-06-18'}})
    if(body.method==='notifications/initialized') return new Response(null,{status:202})
    if(body.method==='tools/list') return json({jsonrpc:'2.0',id:body.id,result:{tools:[{name:'list_events',inputSchema:{type:'object',properties:{days:{type:'integer'},cursor:{type:'string'}}},annotations:{readOnlyHint:true}}]}})
    calls.push(body.params.arguments)
    const values=body.params.arguments.cursor?[{events:[event(3)]}]:[{events:[event(1)]},{events:[event(2)],nextCursor:'next',has_more:true}]
    return json({jsonrpc:'2.0',id:body.id,result:{content:values.map(value=>({type:'text',text:JSON.stringify(value)}))}})
  }
  const result=await readFamilyWallCalendar('test-token',fetcher)
  assert.deepEqual(result.events.map(event=>event.id),['event/1','event/2','event/3'])
  assert.deepEqual(calls,[{days:62},{days:62,cursor:'next'}])
})

test('FamilyWall refuses incomplete snapshots when a continuation is not supported', async () => {
  const fetcher=async (url,init)=>{
    const body=JSON.parse(init.body)
    if(body.method==='initialize') return json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-06-18'}})
    if(body.method==='notifications/initialized') return new Response(null,{status:202})
    if(body.method==='tools/list') return json({jsonrpc:'2.0',id:body.id,result:{tools:[{name:'list_events',inputSchema:{type:'object'},annotations:{readOnlyHint:true}}]}})
    return json({jsonrpc:'2.0',id:body.id,result:{structuredContent:{events:[],nextCursor:'next'}}})
  }
  await assert.rejects(readFamilyWallCalendar('test-token',fetcher),/Incomplete/)
})
