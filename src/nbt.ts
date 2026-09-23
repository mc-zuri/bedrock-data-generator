import nbt from 'prismarine-nbt'
import { readFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'

export type Endian = 'big' | 'little'

export const gzip = (raw: Buffer): Buffer => gzipSync(raw, { level: 9 })
export const gunzip = (buf: Buffer): Buffer => (buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf)

/** Parses an NBT file (gzip or not) of the given byte order and returns it simplified. */
export function readNbt (file: string, endian: Endian): any {
  return nbt.simplify(nbt.parseUncompressed(gunzip(readFileSync(file)), endian))
}

// ---- packets.nbt -----------------------------------------------------------------------------
// { version: serverVersion, protocol: minecraft-data version, packets: [{ id, name, data }] }, gzip, little-endian.
// `data` is the packet exactly as the server sent it (varint id + body), kept before decoding.

export interface CapturedPacket { id: number, name: string, data: Buffer }

export function encodePackets (serverVersion: string, protocol: string, packets: CapturedPacket[]): Buffer {
  const root = nbt.comp({
    version: nbt.string(serverVersion),
    protocol: nbt.string(protocol),
    packets: nbt.list(nbt.comp([...packets].sort((a, b) => a.id - b.id).map(p => ({
      id: nbt.int(p.id),
      name: nbt.string(p.name),
      data: { type: 'byteArray', value: [...new Int8Array(p.data.buffer, p.data.byteOffset, p.data.length)] }
    })) as any))
  } as any, '')
  return gzip(nbt.writeUncompressed(root as any, 'little'))
}

export function decodePackets (file: string): { version: string, protocol: string, packets: CapturedPacket[] } {
  const root = readNbt(file, 'little')
  return {
    version: root.version,
    protocol: root.protocol,
    packets: root.packets.map((p: any) => ({ id: p.id, name: p.name, data: Buffer.from(Int8Array.from(p.data).buffer) }))
  }
}
