// blockStates.json: the server's palette, one entry per runtime id, as it is (name, every state property with
// its NBT type and value, version); each block's states one run, every one with the same properties, each
// combination once, and every combination of its values there (the palette is each block's full product).
import { type Validator } from '../context.ts'

const key = (s: { name: string, states: Record<string, { value: unknown }> }): string => s.name + JSON.stringify(Object.keys(s.states).sort().map(k => [k, s.states[k].value]))

export const blockStates: Validator = (list: any[], { server, bad }) => {
  const palette = server.palette()
  if (list.length !== palette.length) bad(`${list.length} states, the palette has ${palette.length}`)
  for (let i = 0; i < Math.min(list.length, palette.length); i++) {
    const s = list[i], p = palette[i]
    if (s.name !== p.name || s.version !== p.version) { bad(`state ${i}: ${s.name} (${s.version}), the palette's ${p.name} (${p.version})`); continue }
    const props = Object.keys(s.states).sort(), want = Object.keys(p.states).sort()
    if (props.join() !== want.join()) { bad(`state ${i} (${s.name}): properties ${props.join(', ')}, the palette's ${want.join(', ')}`); continue }
    for (const k of props) {
      const a = s.states[k], b = p.states[k] as { type: string, value: unknown }
      if (a.type !== b.type || a.value !== b.value) bad(`state ${i} (${s.name}): ${k} ${a.type} ${JSON.stringify(a.value)}, the palette's ${b.type} ${JSON.stringify(b.value)}`)
    }
  }

  const seen = new Set<string>()
  const blocks = new Map<string, { first: number, last: number, props: string, values: Map<string, Set<unknown>>, count: number }>()
  list.forEach((s, i) => {
    const k = key(s)
    if (seen.has(k)) bad(`state ${i}: ${k} more than once`)
    seen.add(k)
    const props = Object.keys(s.states).sort().join()
    let b = blocks.get(s.name)
    if (!b) blocks.set(s.name, b = { first: i, last: i - 1, props, values: new Map(), count: 0 })
    if (b.last !== i - 1) bad(`${s.name}: its states are not one run (state ${i})`)
    if (b.props !== props) bad(`${s.name}: state ${i} has properties ${props}, its first ${b.props}`)
    b.last = i
    b.count++
    for (const [p, t] of Object.entries<any>(s.states)) {
      if (!b.values.has(p)) b.values.set(p, new Set())
      b.values.get(p)!.add(t.value)
    }
  })
  for (const [name, b] of blocks) {
    const product = [...b.values.values()].reduce((n, set) => n * set.size, 1)
    if (product !== b.count) bad(`${name}: ${b.count} states, its values make ${product}`)
  }
}
