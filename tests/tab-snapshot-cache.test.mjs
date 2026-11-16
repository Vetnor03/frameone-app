import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TAB_SNAPSHOT_PREFIX, TAB_SNAPSHOT_MAX_AGE_MS,
  readTabSnapshot, writeTabSnapshot, clearTabSnapshotsForUser,
} from '../app/lib/tabSnapshotCache.mjs'

const u1 = 'user-12345678', u2 = 'user-87654321', d1='frame-12345678', d2='frame-87654321'
const memory = () => {
  const data = new Map()
  return {
    get length() { return data.size },
    key(index) { return [...data.keys()][index] ?? null },
    getItem(key) { return data.get(key) ?? null },
    setItem(key,val) { data.set(key,val) },
    removeItem(key) { data.delete(key) },
  }
}

test('persistent snapshots are scoped by user, device and feed; logout clears only that user', () => {
  const storage = memory()
  const data = {items:[{id:'n1',title:'Headline',url:'https://www.nrk.no/'}]}
  assert.equal(writeTabSnapshot(storage,u1,d1,'news','top',data,1000),true)
  assert.equal(readTabSnapshot(storage,u1,d1,'news','top',1001).data.items[0].title,'Headline')
  assert.equal(readTabSnapshot(storage,u1,d2,'news','top',1001),null)
  assert.equal(readTabSnapshot(storage,u1,d1,'news','latest',1001),null)
  assert.equal(readTabSnapshot(storage,u2,d1,'news','top',1001),null)
  assert.equal(writeTabSnapshot(storage,u2,d1,'news','top',data,1000),true)
  clearTabSnapshotsForUser(storage,u1)
  assert.equal(readTabSnapshot(storage,u1,d1,'news','top',1001),null)
  assert.ok(readTabSnapshot(storage,u2,d1,'news','top',1001))
})

test('snapshots expire and storage failures never block launch', () => {
  const storage = memory()
  assert.equal(writeTabSnapshot(storage,u1,d1,'countdown','',{items:[]},1000),true)
  assert.equal(readTabSnapshot(storage,u1,d1,'countdown','',1000+TAB_SNAPSHOT_MAX_AGE_MS+1),null)
  assert.equal(readTabSnapshot(storage,u1,d1,'countdown','',-61000),null)
  storage.setItem(TAB_SNAPSHOT_PREFIX+u1+':'+d1+':countdown:', '{broken')
  assert.equal(readTabSnapshot(storage,u1,d1,'countdown','',1100),null)
  const blocked={getItem(){throw Error('denied')},setItem(){throw Error('denied')},removeItem(){throw Error('denied')},get length(){throw Error('denied')},key(){throw Error('denied')}}
  assert.equal(readTabSnapshot(blocked,u1,d1,'news'),null)
  assert.equal(writeTabSnapshot(blocked,u1,d1,'news','',{items:[]}),false)
  assert.doesNotThrow(()=>clearTabSnapshotsForUser(blocked,u1))
})

test('cache strips credentials and unknown fields even from nested tab items',()=>{
  const storage=memory()
  const data={accessToken:'SECRET',items:[{id:'g1',name:'Milk',quantity:1,category:'dairy',isChecked:false,token:'VERY_SECRET'}]}
  assert.equal(writeTabSnapshot(storage,u1,d1,'groceries','list',data,1000),true)
  const raw=storage.getItem(TAB_SNAPSHOT_PREFIX+u1+':'+d1+':groceries:list')
  assert.ok(!raw.includes('SECRET'))
  assert.ok(!raw.includes('token'))
  const restored=readTabSnapshot(storage,u1,d1,'groceries','list',1001)
  assert.deepEqual(restored.data.items.map(x=>x.name),['Milk'])
})

test('reminder and countdown cache preserves display data without arbitrary raw integration payloads',()=>{
  const storage=memory()
  assert.equal(writeTabSnapshot(storage,u1,d1,'reminders','',{items:[{id:'r1',title:'Meeting',date:'2026-11-17',source:'teams',time:'09:00',raw:{accessToken:'NEVER'},sourceUrl:'javascript:alert(1)'}],completedOccurrences:[],availableSources:['remind','teams']},1000),true)
  const r=readTabSnapshot(storage,u1,d1,'reminders','',1001)
  assert.equal(r.data.items[0].title,'Meeting')
  assert.equal(r.data.items[0].sourceUrl,null)
  assert.equal(JSON.stringify(r).includes('NEVER'),false)
  assert.equal(writeTabSnapshot(storage,u1,d1,'countdown','',{items:[{id:'x',title:'Holiday',date:'2026-12-25',pinned:true,secret:'HIDDEN'}]},1000),true)
  const c=readTabSnapshot(storage,u1,d1,'countdown','',1001)
  assert.deepEqual(c.data.items,[{id:'x',title:'Holiday',date:'2026-12-25',pinned:true}])
})
