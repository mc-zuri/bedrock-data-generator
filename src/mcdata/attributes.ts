// attributes.json of a build: the player attributes its server sends in update_attributes, once each, named in
// camel case. Ported from minecraft-data-extractor-legacy2 src/generators/attributes.ts.
import { createRequire } from 'node:module'
import { dataFile, type Build } from '../config.ts'
import { decodePackets } from '../nbt.ts'
import { strip } from './format.ts'

const require = createRequire(import.meta.url)
const { createDeserializer } = require('bedrock-protocol/src/transforms/serializer.js')

const camel = (name: string): string => name.split(/[._]/).map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))).join('')

export function attributes (b: Build): any[] {
  const { protocol, packets } = decodePackets(dataFile(b, 'packets.nbt'))
  const packet = packets.find(p => p.name === 'update_attributes')
  if (!packet) throw new Error(`${b.serverVersion}: packets.nbt has no update_attributes`)
  const seen = new Set<string>()
  const out: any[] = []
  for (const attr of createDeserializer(protocol).parsePacketBuffer(packet.data).data.params.attributes ?? []) {
    const resource = strip(attr.name)
    if (seen.has(resource)) continue
    seen.add(resource)
    out.push({ name: camel(resource), resource, default: attr.default, min: attr.min, max: attr.max })
  }
  return out
}

export const attributesJson = (list: any[]): string => JSON.stringify(list, null, 2)
