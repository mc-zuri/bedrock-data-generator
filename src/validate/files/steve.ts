// steve.json: the default skin, anonymized: every image as many bytes as its width and height say (RGBA),
// the geometry and resource patch JSON, the persona id not a real one.
import { type Validator } from '../context.ts'

const bytes = (b64: string): number => Buffer.from(b64, 'base64').length

export const steve: Validator = (skin: any, { bad }) => {
  if (bytes(skin.SkinData) !== skin.SkinImageWidth * skin.SkinImageHeight * 4) bad(`SkinData is ${bytes(skin.SkinData)} bytes for ${skin.SkinImageWidth}x${skin.SkinImageHeight}`)
  if (bytes(skin.CapeData) !== skin.CapeImageWidth * skin.CapeImageHeight * 4) bad(`CapeData is ${bytes(skin.CapeData)} bytes for ${skin.CapeImageWidth}x${skin.CapeImageHeight}`)
  skin.AnimatedImageData.forEach((a: any, i: number) => {
    if (bytes(a.Image) !== a.ImageWidth * a.ImageHeight * 4) bad(`AnimatedImageData ${i}: ${bytes(a.Image)} bytes for ${a.ImageWidth}x${a.ImageHeight}`)
  })
  for (const k of ['SkinGeometryData', 'SkinResourcePatch']) {
    try { JSON.parse(Buffer.from(skin[k], 'base64').toString('utf8')) } catch { bad(`${k} is not base64 JSON`) }
  }
  // (sent from 1.17.30)
  if (skin.SkinGeometryDataEngineVersion !== undefined && !/^[0-9.]+$/.test(Buffer.from(skin.SkinGeometryDataEngineVersion, 'base64').toString('utf8'))) bad('SkinGeometryDataEngineVersion is not a version')
  // the persona id, where the skin is one, is steve-normalize's placeholder (after the skin's own uuid)
  if (skin.PersonaSkin && !/(^|\.)persona-123456789012345-0$/.test(skin.SkinId)) bad(`SkinId ${skin.SkinId} is not anonymized`)
}
