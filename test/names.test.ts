import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gameNameOf, itemFor, nameOf, titleCase } from '../src/generators/utils/names.ts'

void test("an item's name is the game's, its key translated where the server has none; what nothing names, its name in title case", () => {
  const lang = new Map([
    ['tile.element.h.name', 'Hydrogen'],
    ['tile.stone.name', 'Stone'],
  ])
  assert.equal(nameOf(lang, 'tile.stone'), 'Stone')
  assert.equal(nameOf(lang, 'tile.wooden_door'), undefined)
  assert.equal(gameNameOf(lang, { descriptionName: 'Bucket of Cod' }), 'Bucket of Cod')
  assert.equal(gameNameOf(lang, { descriptionName: 'tile.element.h.name' }), 'Hydrogen', "the chemistry pack's, which the server has not")
  assert.equal(gameNameOf(lang, { descriptionName: 'item.nothing.name' }), undefined)
  assert.equal(gameNameOf(lang, { descriptionName: 'Cobblestone Wall ' }), 'Cobblestone Wall', "the language's own trailing space")
  assert.equal(gameNameOf(lang, { descriptionName: '' }), undefined, 'what the game names nothing')
  const items = new Map([['minecraft:wooden_door', { descriptionName: 'Oak Door' }]])
  assert.equal(itemFor('minecraft:item.wooden_door', items)?.descriptionName, 'Oak Door', "a door's block form: the door's")
  assert.equal(itemFor('minecraft:wooden_door', items), undefined)
  assert.equal(titleCase('minecraft:light_blue_wool'), 'Light Blue Wool')
  assert.equal(titleCase('item.straw_bed'), 'Straw Bed', "a block's item form, by the block's name")
})
