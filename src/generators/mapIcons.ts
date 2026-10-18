// mapIcons.json: the map decoration types, by the type a map's decoration is sent with (enums.json.gz):
// - from 1.26.40, every type the game's reflection registers for MapDecoration::Type, in the enum's order, by its name
//   there (MarkerWhite, VillageDesert);
// - before, the server names no type: only those its exploration maps mark, each with the feature it leads to, named as
//   the next build that names them does (the type is the same byte).
// No appearance and no visibleInItemFrame: the server says neither (minecraft-data's schema lets them be absent). A
// build with neither keeps what the version points to.
import type { BedrockData, EnumName } from '../bedrockData.ts'
import { compareVersions } from '../versions.ts'
import type { Generator } from './index.ts'
import { canonical } from './utils/json.ts'

export interface MapIcon {
  id: number
  name: string
}

/** the types the next release that names them gives names, where `build` names none */
function laterNames(data: BedrockData, build: string): EnumName[] {
  const later = data.releases.filter((b) => compareVersions(b, build) > 0 && data.has(b, 'enums')).sort(compareVersions)

  for (const b of later) {
    const names = data.enums(b).mapDecorations

    if (names.length) {
      return names
    }
  }

  return []
}

function mapIconsOf(data: BedrockData, build: string): MapIcon[] {
  const { mapDecorations, explorationMarkers } = data.enums(build)

  if (mapDecorations.length) {
    return mapDecorations.map(({ id, name }) => ({ id, name }))
  }

  const names = new Map(laterNames(data, build).map((e) => [e.id, e.name]))
  const ids = [...new Set(explorationMarkers.map((e) => e.id))].filter((id) => names.has(id)).sort((a, b) => a - b)
  return ids.map((id) => ({ id, name: names.get(id) ?? String(id) }))
}

// minecraft-data's map icon requires visibleInItemFrame, which the server does not say
const REQUIRED = '"required": ["id", "name", "visibleInItemFrame"]'

export const mapIcons: Generator = {
  key: 'mapIcons',
  after: ['tints', 'sounds', 'particles'],
  has: (data, build) => data.has(build, 'enums') && mapIconsOf(data, build).length > 0,
  json(data, build) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(mapIconsOf(data, build), null, 2)
  },
  meaning: canonical,
  schema: { file: 'mapIcons_schema.json', edit: (text) => text.replace(REQUIRED, '"required": ["id", "name"]') },
}
