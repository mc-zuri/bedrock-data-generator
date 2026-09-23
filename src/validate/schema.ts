// The strict JSON schemas of schemas/ (one per published file, stricter than minecraft-data's own: every
// field typed and ranged, no field a file does not have, the enums every value is one of).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Ajv, type ValidateFunction } from 'ajv'
import { ROOT } from '../config.ts'

export const SCHEMAS_DIR = join(ROOT, 'schemas')

let compiled: Record<string, ValidateFunction> | undefined

function schemas (): Record<string, ValidateFunction> {
  if (compiled) return compiled
  const ajv = new Ajv({ allErrors: true, strict: true, strictTypes: false, strictRequired: false })
  const files = readdirSync(SCHEMAS_DIR).filter(f => f.endsWith('.schema.json'))
  for (const f of files) ajv.addSchema(JSON.parse(readFileSync(join(SCHEMAS_DIR, f), 'utf8')))
  compiled = {}
  for (const f of files) {
    const id = f.replace('.schema.json', '')
    if (id !== 'common') compiled[id] = ajv.getSchema(id)!
  }
  return compiled
}

/** The keys that have a schema. */
export const schemaKeys = (): string[] => Object.keys(schemas())

/** What is wrong with `data` as the `key` file: one line per error (at most `max`), none when it fits. */
export function schemaProblems (key: string, data: unknown, max = 20): string[] {
  const validate = schemas()[key]
  if (!validate) throw new Error(`no schema for ${key} (schemas/${key}.schema.json)`)
  if (validate(data)) return []
  return (validate.errors ?? []).slice(0, max).map(e => `${e.instancePath || '/'} ${e.message}${e.params && 'allowedValues' in e.params ? ` (${(e.params as any).allowedValues.join(', ')})` : ''}${valueAt(data, e.instancePath)}`)
}

function valueAt (data: unknown, pointer: string): string {
  let at: any = data
  for (const part of pointer.split('/').slice(1)) at = at?.[part.replace(/~1/g, '/').replace(/~0/g, '~')]
  const text = JSON.stringify(at)
  return text === undefined ? '' : `: ${text.length > 80 ? text.slice(0, 80) + '...' : text}`
}
