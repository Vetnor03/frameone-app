#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { inspectEdgeOfNorwayHtmlInput, parseEdgeOfNorwayListPage } from '../app/lib/integrations/local-events/edge-of-norway-shadow.ts'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: node scripts/test-edge-of-norway-html.mjs "/path/to/page.html"')
  process.exit(1)
}

const html = readFileSync(filePath, 'utf8')
const input = inspectEdgeOfNorwayHtmlInput(html)
const parsed = parseEdgeOfNorwayListPage(html)

console.log(`raw Flight markers: ${input.rawFlightMarkerCount}`)
console.log(`decoded chunks: ${parsed.flightChunksDecoded}`)
console.log(`Event objects found: ${parsed.eventObjectsFound}`)
console.log(`unique Event objects: ${parsed.uniqueEvents}`)
console.log(`accepted events: ${parsed.acceptedCount}`)
console.log(`skipped counts: ${JSON.stringify(parsed.skippedCounts)}`)
if (parsed.parsingErrors.length) console.log(`parsing errors: ${JSON.stringify(parsed.parsingErrors)}`)
