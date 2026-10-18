import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nameOf, nameOfItemFor, titleCase } from '../src/generators/utils/names.ts'

void test("an item named item.<x> has the item <x>'s name; what the language names nothing of, its name in title case", () => {
  const lang = new Map([
    ['item.wooden_door.name', 'Oak Door'],
    ['tile.stone.name', 'Stone'],
  ])
  const items = new Map([
    ['minecraft:wooden_door', { descriptionId: 'item.wooden_door' }],
    ['minecraft:item.wooden_door', { descriptionId: 'tile.wooden_door' }],
  ])
  assert.equal(nameOf(lang, 'tile.stone'), 'Stone')
  assert.equal(nameOf(lang, 'tile.wooden_door'), undefined)
  assert.equal(nameOfItemFor(lang, 'minecraft:item.wooden_door', items), 'Oak Door')
  assert.equal(nameOfItemFor(lang, 'minecraft:wooden_door', items), undefined)
  assert.equal(nameOfItemFor(lang, 'minecraft:item.nothing', items), undefined)
  assert.equal(titleCase('minecraft:light_blue_wool'), 'Light Blue Wool')
})
