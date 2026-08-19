import { readFile } from 'node:fs/promises'

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error
    return nextResolve(`${specifier}.ts`, context)
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.json')) {
    const json = await readFile(new URL(url), 'utf8')
    return { format: 'module', shortCircuit: true, source: `export default ${json}` }
  }
  return nextLoad(url, context)
}
