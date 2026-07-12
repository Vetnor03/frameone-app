#!/usr/bin/env node
import { runEdgeOfNorwayShadowDiagnostic } from '../app/lib/integrations/local-events/edge-of-norway-shadow.ts'

const result = await runEdgeOfNorwayShadowDiagnostic()
console.log(JSON.stringify(result, null, 2))
