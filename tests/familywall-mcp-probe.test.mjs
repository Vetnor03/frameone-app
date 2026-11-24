import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { FAMILYWALL_RESOURCE, trustedEndpoint, startFamilyWallProbe, exchangeProbeCode, discoverFamilyWallTools } from '../app/lib/integrations/familywall/probe.ts'

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
