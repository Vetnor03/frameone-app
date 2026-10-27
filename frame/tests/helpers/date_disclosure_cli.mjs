// Test adapter. No runtime import; emits one plan per JSON request line.
import {readFileSync} from 'node:fs'
import {planDateDisclosure} from '../../../app/lib/dateContentPlanner.mjs'
const data=readFileSync(0,'utf8').trim()
if(data)for(const line of data.split(/\r?\n/)){
  const {cell,facts}=JSON.parse(line)
  console.log(JSON.stringify(planDateDisclosure(cell,facts)))
}
