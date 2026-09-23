// attributes.json: exactly the attributes the server sends (update_attributes), once each, with its default
// and range; the name the resource in camel case.
import { sameSet, unique, type Validator } from '../context.ts'

const camel = (name: string): string => name.split(/[._]/).map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('')

export const attributes: Validator = (list: any[], { server, bad }) => {
  const own = server.attributes()
  unique(list, a => a.name, 'attribute', bad)
  unique(list, a => a.resource, 'attribute resource', bad)
  sameSet(list.map(a => a.resource), own.map(a => a.resource), 'attributes', bad)
  const byResource = new Map(own.map(a => [a.resource, a]))
  for (const a of list) {
    const at = `${a.name}:`
    if (a.name !== camel(a.resource)) bad(`${at} not the camel case of ${a.resource}`)
    if (!(a.min <= a.default && a.default <= a.max)) bad(`${at} default ${a.default} outside ${a.min}..${a.max}`)
    const s = byResource.get(a.resource)
    if (s && (s.default !== a.default || s.min !== a.min || s.max !== a.max)) bad(`${at} ${a.default} (${a.min}..${a.max}), the server's ${s.default} (${s.min}..${s.max})`)
  }
}
