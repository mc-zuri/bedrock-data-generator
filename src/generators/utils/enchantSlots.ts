// Enchant::Slot: the bits an item's slots (Item::getEnchantSlot) and an enchantment's slots are made of, by the names
// minecraft-data's enchantment categories and items' enchantCategories are written in.
import type { Enchantment } from '../../bedrockData.ts'

// Each bit by the name the server's minecraft:enchantable component reads it by (the trident's is spear); the server
// names no slot of the compass, the warped fungus on a stick or the brush: they are named for their item. The server
// also has g_armor, g_tool and g_digging, but nothing it says gives their bits: a set of slots is named by its slots.
const ENCHANT_SLOTS: [bit: number, name: string][] = [
  [0x1, 'armor_head'],
  [0x2, 'armor_torso'],
  [0x4, 'armor_feet'],
  [0x8, 'armor_legs'],
  [0x10, 'sword'],
  [0x20, 'bow'],
  [0x40, 'hoe'],
  [0x80, 'shears'],
  [0x100, 'flintsteel'],
  [0x200, 'axe'],
  [0x400, 'pickaxe'],
  [0x800, 'shovel'],
  [0x1000, 'fishing_rod'],
  [0x2000, 'carrot_stick'],
  [0x4000, 'elytra'],
  [0x8000, 'spear'],
  [0x10000, 'crossbow'],
  [0x20000, 'shield'],
  [0x40000, 'cosmetic_head'],
  [0x80000, 'compass'],
  [0x100000, 'warped_fungus_on_a_stick'],
  [0x200000, 'brush'],
  [0x400000, 'heavy_weapon'],
  [0x800000, 'melee_spear'],
]
const NAMED_SLOTS = ENCHANT_SLOTS.reduce((all, [bit]) => all | bit, 0)
/** every slot: the books', and vanishing's */
const ALL = -1

/** The names of the slots `bits` has; all for every slot. */
export function slotNames(bits: number, what: string): string[] {
  if (bits === ALL) {
    return ['all']
  }

  if (bits & ~NAMED_SLOTS) {
    throw new Error(`${what}: enchant slots 0x${(bits >>> 0).toString(16)}, a slot the server has no name for`)
  }

  return ENCHANT_SLOTS.filter(([bit]) => bits & bit).map(([, slot]) => slot)
}

/** The slots an enchantment can be put on: those an enchanting table offers it for, and those only an anvil puts it on. */
function enchantmentSlots(e: Enchantment): number {
  return e.primarySlots | e.secondarySlots
}

/** An enchantment's category: its slots, named, joined with + ("sword+axe+melee_spear"). */
export function enchantmentCategory(e: Enchantment): string {
  return slotNames(enchantmentSlots(e), e.name).join('+')
}

/** An item's enchantCategories: the names of its own slots; undefined where nothing enchants it. */
export function itemEnchantCategories(slots: number, name: string): string[] | undefined {
  return slots === 0 ? undefined : slotNames(slots, name)
}
