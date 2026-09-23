// The steve step's relay tags the persona id (persona-<playfabid>-<N>) in SkinId, SkinResourcePatch and
// SkinGeometryData. The <playfabid> is the skin's PlayFab ID (the id PlayFab stores the skin under,
// see bedrock-protocol handshake/login.js) and varies by capture account; the trailing <N> is a
// per-capture counter. Both are opaque to the protocol (the only constraint is that
// SkinResourcePatch's geometry name resolves in SkinGeometryData — which it still does because we
// rewrite all three fields together). Canonicalizing the persona id to a single fixed PlayFab ID + -0
// makes captures deterministic so identical skins are byte-identical and dedup across versions, and
// keeps the capturing account out of them. Older clients write the id in hex, newer ones in base 36
// (persona-437vsr5lh19kek5q-3).

const CANONICAL_PLAYFAB_ID = '123456789012345'
const fixPersona = (s: string) => s.replace(/(persona[-_])[0-9a-z]+-\d+/gi, (_m, prefix) => `${prefix}${CANONICAL_PLAYFAB_ID}-0`)

export function normalizeSteveSkin<T extends Record<string, any>>(skin: T): T {
  const out: Record<string, any> = { ...skin }
  if (typeof out.SkinId === 'string') out.SkinId = fixPersona(out.SkinId)
  for (const key of ['SkinResourcePatch', 'SkinGeometryData']) {
    if (typeof out[key] === 'string') {
      out[key] = Buffer.from(fixPersona(Buffer.from(out[key], 'base64').toString('utf8')), 'utf8').toString('base64')
    }
  }
  return out as T
}
