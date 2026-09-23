// foods.json: the items the server says are food, each once, each the item of its name in items.json (its
// id, stack size, name); the values its item registry says where it sends them (from 1.21.60); saturation
// the food points times the ratio, effectiveQuality their sum.
import nbt from 'prismarine-nbt'
import { sameFloat, sameSet, unique, type Validator } from '../context.ts'

const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6

export const foods: Validator = (list: any[], { server, files, bad }) => {
  unique(list, f => f.name, 'food', bad)
  const items = new Map<string, any>(files('items').map((i: any) => [i.name, i]))
  const registry = new Map<string, { nutrition: number, saturation_modifier: number }>()
  for (const s of server.itemStates()) {
    const food = s.nbt ? (nbt.simplify(s.nbt as any) as any)?.components?.['minecraft:food'] : undefined
    if (food) registry.set(s.name.replace(/^minecraft:/, ''), food)
  }
  if (registry.size) sameSet(list.map(f => f.name), registry.keys(), 'foods', bad)
  for (const f of list) {
    const at = `${f.name}:`
    const i = items.get(f.name)
    if (!i) { bad(`${at} no item`); continue }
    if (f.id !== i.id || f.stackSize !== i.stackSize || f.displayName !== i.displayName) bad(`${at} ${f.id} ${f.stackSize} ${f.displayName}, its item's ${i.id} ${i.stackSize} ${i.displayName}`)
    if (!close(f.saturation, f.foodPoints * f.saturationRatio)) bad(`${at} saturation ${f.saturation}, ${f.foodPoints} x ${f.saturationRatio}`)
    if (!close(f.effectiveQuality, f.foodPoints + f.saturation)) bad(`${at} effectiveQuality ${f.effectiveQuality}, ${f.foodPoints} + ${f.saturation}`)
    const r = registry.get(f.name)
    if (r && (r.nutrition !== f.foodPoints || !sameFloat(r.saturation_modifier, f.saturationRatio / 2))) bad(`${at} ${f.foodPoints} / ${f.saturationRatio}, the registry's ${r.nutrition} / ${r.saturation_modifier} x 2`)
  }
}
