// Independent test-only JS parity source, never imported by the app.
import readline from 'node:readline'
import {planDateEditorialCompact} from '../../../app/lib/dateEditorialCompactComposition.mjs'
for await(const line of readline.createInterface({input:process.stdin})){
  const p=planDateEditorialCompact(JSON.parse(line))
  console.log(JSON.stringify(p))
}
