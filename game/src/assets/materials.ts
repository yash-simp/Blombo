// Shared materials for the Blender packs. Every pack mesh carries per-corner vertex colours (base colour
// x baked ambient occlusion) and a material NAME that says how it is shaded:
//   toon  - the engine's part shading (toonMaterial: colour x world light, sun shadows) x vertex colour
//   glow  - unlit vertex colour: lanterns, crystals, mushrooms, lava (bright at night)
//   glass - like toon, see-through
//   water - replaced by the water material (src/world/water.ts)
import { MeshBasicNodeMaterial, type Node } from "three/webgpu"
import { float, vec4, vertexColor } from "three/tsl"
import { toonMaterial } from "@blombo/game-runtime"
import type { Material } from "three"

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
