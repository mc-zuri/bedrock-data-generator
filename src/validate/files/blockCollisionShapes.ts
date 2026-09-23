// blockCollisionShapes.json: blocks.json's blocks (in any order: a version shares an earlier file of the same shapes), one shape per state (or one id for all), each
// id a shape of the table, each state's boxes the server's (block-state-shapes.nbt).
import { sameSet, type Validator } from '../context.ts'

const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-5

export const blockCollisionShapes: Validator = (data: any, { server, files, bad }) => {
  const names: string[] = files('blocks').map((b: any) => b.name)
  const order = Object.keys(data.blocks)
  sameSet(order, names, 'blocks', bad)

  const palette = server.palette()
  const shapes = server.shapes()
  const states = new Map<string, number[]>()
  palette.forEach((s, i) => { if (!states.has(s.name)) states.set(s.name, []); states.get(s.name)!.push(i) })

  const used = new Set<string>()
  for (const [name, value] of Object.entries<number | number[]>(data.blocks)) {
    const runtimeIds = states.get(name)
    if (!runtimeIds) continue
    const ids = typeof value === 'number' ? runtimeIds.map(() => value) : value
    if (ids.length !== runtimeIds.length) { bad(`${name}: ${ids.length} shapes for ${runtimeIds.length} states`); continue }
    ids.forEach((id, i) => {
      used.add(String(id))
      const boxes: number[][] | undefined = data.shapes[id]
      if (!boxes) { bad(`${name}: shape ${id} is not in the table`); return }
      const want = shapes[runtimeIds[i]]
      const same = boxes.length === want.length && boxes.every((box, j) => box.every((n, k) => close(n, want[j][k])))
      if (!same) bad(`${name} state ${runtimeIds[i]}: shape ${id} ${JSON.stringify(boxes)}, the server's ${JSON.stringify(want)}`)
    })
  }
  for (const [id, boxes] of Object.entries<number[][]>(data.shapes)) {
    for (const b of boxes) if (b[0] > b[3] || b[1] > b[4] || b[2] > b[5]) bad(`shape ${id}: box ${JSON.stringify(b)} has a min above its max`)
  }
  if (!used.has('0') && shapes.some(s => s.length === 0)) bad('no block uses shape 0, but some state has no collision')
}
