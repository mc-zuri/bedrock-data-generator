// commands.json: every command the server names in available_commands (commands.json.gz), as minecraft-data's tree of
// nodes, from the usage its console's help prints for it: one path a usage line, merged where they agree.
// - a literal word (objectives, add) is a literal node, and each choice of <list|sidebar> one;
// - <name: type> and [name: type] are argument nodes, their parser the game's name for the type (int, x y z, target,
//   wildcard int) or for the enum they take (GameMode, Item); modifier null;
// - a node is executable where a usage line may end: after its last required word;
// - an alias (tp) is a literal node redirecting to its command (teleport);
// - parsers: each parser once, an enum's examples its values, sorted, as commands.json.gz has them (a soft enum's as the
//   server fills them when a client joins: ScoreboardObjectives none).
import type { BedrockData } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { canonical } from './utils/json.ts'

interface Parser {
  parser: string
  modifier: null
}

export interface CommandNode {
  type: 'root' | 'literal' | 'argument'
  name: string
  executable: boolean
  redirects: string[]
  parser?: Parser
  children: CommandNode[]
}

export interface Commands {
  root: CommandNode
  parsers: (Parser & { examples: string[] })[]
}

interface Word {
  /** a literal's choices (one for a plain word), or an argument */
  choices?: string[]
  argument?: { name: string; type: string }
  optional: boolean
}

/** "- /scoreboard objectives setdisplay <list|sidebar> [objective: string]" -> its words after the command's name */
export function usageWords(line: string): Word[] {
  const tokens = line.replace(/^- \//, '').match(/<[^>]*>|\[[^\]]*\]|\S+/g) ?? []
  return tokens.slice(1).map((token) => {
    if (!/^[<[]/.test(token)) {
      return { choices: [token], optional: false }
    }

    const optional = token.startsWith('[')
    const inner = token.slice(1, -1)
    const colon = inner.indexOf(': ')
    return colon < 0 ? { choices: inner.split('|'), optional } : { argument: { name: inner.slice(0, colon), type: inner.slice(colon + 2) }, optional }
  })
}

function node(type: CommandNode['type'], name: string, parser?: Parser): CommandNode {
  return parser ? { type, name, executable: false, redirects: [], parser, children: [] } : { type, name, executable: false, redirects: [], children: [] }
}

function childOf(parent: CommandNode, child: CommandNode): CommandNode {
  const same = parent.children.find((c) => c.type === child.type && c.name === child.name && c.parser?.parser === child.parser?.parser)

  if (same) {
    return same
  }

  parent.children.push(child)
  return child
}

function insert(parent: CommandNode, words: Word[], at: number): void {
  if (words.slice(at).every((w) => w.optional)) {
    parent.executable = true
  }

  if (at === words.length) {
    return
  }

  const word = words[at]
  const children = word.argument
    ? [node('argument', word.argument.name, { parser: word.argument.type, modifier: null })]
    : (word.choices ?? []).map((choice) => node('literal', choice))

  for (const child of children) {
    insert(childOf(parent, child), words, at + 1)
  }
}

function commandsJson(data: BedrockData, build: string): Commands {
  const { commands, enums } = data.commands(build)
  const root = node('root', 'root')
  const types = new Set<string>()

  for (const { name, aliases, help } of commands) {
    const usages = help.filter((line) => line.startsWith('- /'))

    if (!usages.length) {
      throw new Error(`${name}: the console's help gives no usage (${JSON.stringify(help)})`)
    }

    const command = childOf(root, node('literal', name))

    for (const line of usages) {
      const words = usageWords(line)

      for (const w of words) {
        if (w.argument) {
          types.add(w.argument.type)
        }
      }

      insert(command, words, 0)
    }

    for (const alias of aliases) {
      childOf(root, { ...node('literal', alias), redirects: [name] })
    }
  }

  root.children.sort((a, b) => a.name.localeCompare(b.name))
  const parsers = [...types].sort().map((parser) => ({ parser, modifier: null, examples: enums[parser] ?? [] }))
  return { root, parsers }
}

export const commands: Generator = {
  key: 'commands',
  after: ['recipes'],
  has: (data, build) => data.has(build, 'commands'),
  json(data, build) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(commandsJson(data, build), null, 2)
  },
  meaning: canonical,
}
