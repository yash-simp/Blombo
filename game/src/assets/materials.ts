// Shared materials for the Blender packs. Every pack mesh carries per-corner vertex colours (base colour
// x baked ambient occlusion) and a material NAME that says how it is shaded:
//   toon  - the engine's part shading (toonMaterial: colour x world light, sun shadows) x vertex colour
//   glow  - unlit vertex colour: lanterns, crystals, mushrooms, lava (bright at night)
//   glass - like toon, see-through
//   water - replaced by the water material (src/world/water.ts)
// Zone terrain and paths use groundMaterial: the toon shading x vertex colour x a detail texture.
import { MeshBasicNodeMaterial, type Node } from "three/webgpu"
import * as TSL from "three/tsl"
import { float, vec4, vertexColor } from "three/tsl"
import { toonMaterial } from "@blombo/game-runtime"
import { DataTexture, ImageBitmapLoader, NoColorSpace, RepeatWrapping, Texture, type Material } from "three"
import { assetUrl } from "./gltf"

// The ground shader graph uses TSL's untyped chain API (its generics cannot follow node arithmetic).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L = TSL as any

type Mul = Node & { mul(other: unknown): Node }
type ColorNode = MeshBasicNodeMaterial["colorNode"]

/** The engine's toon shading times the mesh's vertex colours. */
export function vertexToon(options: { castShadow?: boolean; tint?: number } = {}): MeshBasicNodeMaterial {
  const material = toonMaterial({ color: options.tint ?? 0xffffff, castShadow: options.castShadow ?? true }) as unknown as MeshBasicNodeMaterial
  material.colorNode = (material.colorNode as Mul).mul(vertexColor()) as unknown as ColorNode
  material.name = "toon"
  return material
}

/** Unlit vertex colours with an optional brightness boost (glowing things). */
export function vertexGlow(boost = 1): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial()
  material.colorNode = (
    boost === 1 ? vertexColor() : (vertexColor() as unknown as Mul).mul(vec4(float(boost), float(boost), float(boost), 1))
  ) as unknown as ColorNode
  material.name = "glow"
  return material
}

/** Toon shading, see-through (aquarium glass, ice). Never casts a shadow. */
export function vertexGlass(opacity = 0.35): MeshBasicNodeMaterial {
  const material = vertexToon({ castShadow: false })
  material.transparent = true
  material.opacity = opacity
  material.depthWrite = false
  material.name = "glass"
  return material
}

/** Metres per texture repeat. */
const GROUND_TILE = 3.5
/**
 * The detail layers: texture channel, share of the rotated second sample, and how far the detail swings
 * the colour (shade = 1 + (value - 0.5) x strength; the two-sample mix loses some contrast, so those
 * layers get a little more).
 */
const GROUND_LAYERS = {
  grass: { channel: "r", second: 0.4, strength: 1.25 },
  dirt: { channel: "a", second: 0.35, strength: 1.25 },
  sand: { channel: "g", second: 0.4, strength: 1.0 },
  paving: { channel: "b", second: 0, strength: 0.95 },
}
/** The detail fades out between these view distances (metres). */
const GROUND_FADE = [22, 70]
/** Anisotropic filtering for the full ground material (the cheap one uses plain mipmaps). */
const GROUND_ANISOTROPY = 4
/**
 * Ground detail (pipeline/blender/ground_tex.py): four greyscale layers, R grass, G sand (and snow),
 * B paving, A dirt (paths, rock, ash), each about 0.5 on average. It is data, not colour. Until it has
 * loaded (and if it fails) the shader samples a neutral 1x1 texture: plain vertex colour, never dark.
 */
const neutral = new DataTexture(new Uint8Array([128, 128, 128, 128]), 1, 1)
neutral.colorSpace = NoColorSpace
neutral.wrapS = neutral.wrapT = RepeatWrapping
neutral.needsUpdate = true
const detailNodes: { value: Texture }[] = []
let detail: Texture | null = null
let detailLoad: Promise<void> | null = null
let cheapGround = false

/**
 * Starts loading the ground detail texture once (World.init; nothing waits for it). The ground shows plain
 * vertex colour until it arrives, then every ground material switches to it.
 */
export function loadGroundDetail(): Promise<void> {
  if (!detailLoad) {
    // an ImageBitmap decoded without premultiplying: the alpha channel is a layer, not coverage
    detailLoad = new ImageBitmapLoader()
      .setOptions({ premultiplyAlpha: "none", colorSpaceConversion: "none", imageOrientation: "flipY" })
      .loadAsync(assetUrl("models/ground_detail.webp"))
      .then((bitmap) => {
        const texture = new Texture(bitmap)
        texture.flipY = false
        texture.colorSpace = NoColorSpace
        texture.wrapS = texture.wrapT = RepeatWrapping
        texture.anisotropy = cheapGround ? 1 : GROUND_ANISOTROPY
        texture.needsUpdate = true
        detail = texture
        for (const node of detailNodes) node.value = texture
      })
      .catch((error) => console.warn("ground detail texture failed", error))
  }
  return detailLoad
}

/**
 * Toon shading x vertex colour x ground detail, for zone terrain and paths. The vertex colour alpha is
 * the surface type the zone builder wrote (1 grass, 0.67 dirt, 0.33 sand, 0 paving; neighbours blend).
 * The detail is sampled top-down in the zone's own metres (zone meshes are zone-local), plus a rotated,
 * larger copy that hides the repeat (not in the cheap version), and fades out with distance so far
 * ground does not shimmer, and on steep faces, where a top-down sample would streak.
 */
function groundToon(cheap: boolean): MeshBasicNodeMaterial {
  const material = toonMaterial({ color: 0xffffff, castShadow: false }) as unknown as MeshBasicNodeMaterial
  const vc = L.vertexColor()
  const kind = vc.a
  const uvA = L.positionLocal.xz.div(GROUND_TILE)
  const a = L.texture(detail ?? neutral, uvA)
  detailNodes.push(a)
  let b = null
  if (!cheap) {
    const uvB = L.vec2(uvA.x.mul(0.8).sub(uvA.y.mul(0.6)), uvA.x.mul(0.6).add(uvA.y.mul(0.8))).mul(0.43).add(L.vec2(0.31, 0.67))
    b = L.texture(detail ?? neutral, uvB)
    detailNodes.push(b)
  }
  // hat weights around 1, 2/3, 1/3 and 0: they sum to 1, so a blend between two types mixes their layers
  const weights = {
    grass: L.saturate(kind.sub(2 / 3).mul(3)),
    dirt: L.saturate(L.float(1).sub(L.abs(kind.sub(2 / 3)).mul(3))),
    sand: L.saturate(L.float(1).sub(L.abs(kind.sub(1 / 3)).mul(3))),
    paving: L.saturate(L.float(1 / 3).sub(kind).mul(3)),
  }
  let value = L.float(0)
  let strength = L.float(0)
  for (const [name, layer] of Object.entries(GROUND_LAYERS)) {
    const w = weights[name as keyof typeof weights]
    const mixed = b !== null && layer.second > 0
    value = value.add((mixed ? L.mix(a[layer.channel], b[layer.channel], layer.second) : a[layer.channel]).mul(w))
    // one sample alone has more contrast than the mix: scaled to match, the cheap ground looks the same
    strength = strength.add(w.mul(layer.strength * (mixed ? 1 : Math.hypot(1 - layer.second, layer.second))))
  }
  // bright ground (snow, pale sand) has no headroom: lit crests would clip to white, so it swings less
  strength = strength.mul(L.float(1).sub(L.smoothstep(0.7, 0.92, L.luminance(vc.rgb)).mul(0.55)))
  const fade = L.float(1)
    .sub(L.smoothstep(GROUND_FADE[0], GROUND_FADE[1], L.positionView.z.negate()))
    .mul(L.smoothstep(0.45, 0.75, L.normalWorldGeometry.y))
  const shade = L.float(1).add(value.sub(0.5).mul(strength).mul(fade))
  material.colorNode = (material.colorNode as Mul).mul(L.vec4(vc.rgb.mul(shade), 1)) as unknown as ColorNode
  material.name = "ground"
  return material
}

const ground: { full?: MeshBasicNodeMaterial; cheap?: MeshBasicNodeMaterial } = {}
/**
 * The material for zone terrain and paths (never casts): full, or cheap for the low quality level (one
 * sample, plain mipmaps). Both share the detail texture, whose filtering follows the last pick.
 */
export function groundMaterial(cheap: boolean): Material {
  if (cheap !== cheapGround) {
    cheapGround = cheap
    if (detail) {
      detail.anisotropy = cheap ? 1 : GROUND_ANISOTROPY
      detail.needsUpdate = true
    }
  }
  return cheap ? (ground.cheap ??= groundToon(true)) : (ground.full ??= groundToon(false))
}

export interface PackMaterials {
  toon: Material
  /** Toon without a sun shadow: grass, flowers, small clutter (cheaper shadow maps). */
  toonFlat: Material
  glow: Material
  glass: Material
}
let shared: PackMaterials | null = null
/** One set for the whole page: every pack mesh shares them. */
export function packMaterials(): PackMaterials {
  if (!shared) shared = { toon: vertexToon(), toonFlat: vertexToon({ castShadow: false }), glow: vertexGlow(), glass: vertexGlass() }
  return shared
}
