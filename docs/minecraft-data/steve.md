# steve.json

**Shape:** object (single skin record).
**Generator:** `src/generators/steve.ts` (`SteveGenerator`).
**Source:** a pre-captured `data/bedrock/<ver>/steve.json` (produced out-of-band by
`captureSteve.ts`); copied through verbatim (re-stringified, minified).

The default player ("Steve") skin / appearance capture for the version. The generator does not
transform it — it just re-emits the captured JSON. Throws if the capture is missing for the version.

## Properties

The object is the raw Bedrock skin payload. Top-level fields observed in `1.16.201`:

| Property                             | Type          | Description                                                                                                              |
| ------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `AnimatedImageData`                  | array         | Animation frames, each `{ AnimationExpression, Frames, Image, ImageHeight, ImageWidth, Type }` (`Image` is base64 RGBA). |
| `SkinId`                             | string        | Skin identifier.                                                                                                         |
| `SkinData`                           | base64        | Base skin texture pixels.                                                                                                |
| `SkinImageWidth` / `SkinImageHeight` | number        | Base skin texture dimensions.                                                                                            |
| `SkinColor`                          | string        | Skin base color.                                                                                                         |
| `SkinGeometryData`                   | string        | Skin geometry (model) definition.                                                                                        |
| `SkinResourcePatch`                  | string        | Resource patch JSON.                                                                                                     |
| `SkinAnimationData`                  | string/base64 | Animation data blob.                                                                                                     |
| `ArmSize`                            | string        | Arm thickness (e.g. `wide`/`slim`).                                                                                      |
| `CapeData`                           | base64        | Cape texture pixels.                                                                                                     |
| `CapeId`                             | string        | Cape identifier.                                                                                                         |
| `CapeImageWidth` / `CapeImageHeight` | number        | Cape texture dimensions.                                                                                                 |
| `CapeOnClassicSkin`                  | boolean       | Whether the cape applies on a classic skin.                                                                              |
| `PersonaSkin`                        | boolean       | Whether this is a persona (customizable) skin.                                                                           |
| `PersonaPieces`                      | array         | Persona body-piece definitions.                                                                                          |
| `PieceTintColors`                    | array         | Tint colors for persona pieces.                                                                                          |
| `PremiumSkin`                        | boolean       | Whether the skin is premium.                                                                                             |

> Exact fields are whatever the capture contains; the generator passes them through unchanged, so the
> set can vary by capture/version. Inspect the file directly for the full schema.

## Version breakpoints

- **Pass-through, no transformation.** Field set depends entirely on the captured skin payload for
  each version. The generator only ensures valid JSON and minifies it.
