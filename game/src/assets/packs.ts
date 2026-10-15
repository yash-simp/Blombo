// The Blender GLB packs and their parts: one geometry per (prop, material) for instancing, clones for
// single objects (NPCs, fish, boats), and the props' metadata (light anchors).
import { Matrix4, type BufferGeometry, type Material, type Mesh, type Object3D } from "three"
import { assetUrl, loadPack } from "./gltf"
import { packMaterials } from "./materials"

export interface PackPart {
  geometry: BufferGeometry
  /** Material name from Blender: toon, glow, glass, water. */
  kind: string
  /** The part's transform relative to its prop root. */
  matrix: Matrix4
}

/** Blender may suffix material names ("water.001"): the kind is the prefix. */
export function materialKind(name: string): "toon" | "glow" | "glass" | "water" {
  if (name.startsWith("glow")) return "glow"
  if (name.startsWith("glass")) return "glass"
  if (name.startsWith("water")) return "water"
  return "toon"
}

export interface PropMeta {
  collider: unknown
  anchors: Record<string, number[]>
  tris: number
}

const partCache = new Map<string, PackPart[]>()
const roots = new Map<string, Object3D>()

/** Loads a pack and indexes its top-level objects by name. */
export async function loadPackRoots(path: string): Promise<void> {
  const gltf = await loadPack(path)
  for (const child of gltf.scene.children) roots.set(child.name, child)
}

export function hasRoot(name: string): boolean {
  return roots.has(name)
}

/** The parts of a named prop (from any loaded pack), cached. */
export function propParts(name: string): PackPart[] {
  const cached = partCache.get(name)
  if (cached) return cached
  const root = roots.get(name)
  if (!root) return []
  root.updateMatrixWorld(true)
  const inverse = new Matrix4().copy(root.matrixWorld).invert()
  const parts: PackPart[] = []
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const material = mesh.material as Material
    parts.push({ geometry: mesh.geometry, kind: materialKind(material.name), matrix: new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld) })
  })
  partCache.set(name, parts)
  return parts
}

/** A fresh copy of a named object with the shared pack materials (geometry is shared). */
export function cloneRoot(name: string, materials?: { toon?: Material; glow?: Material; glass?: Material }): Object3D | null {
  const root = roots.get(name)
  if (!root) return null
  const copy = root.clone(true)
  const shared = packMaterials()
  copy.position.set(0, 0, 0)
  copy.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const kind = materialKind((mesh.material as Material).name)
    mesh.material =
      kind === "glow" ? (materials?.glow ?? shared.glow) : kind === "glass" ? (materials?.glass ?? shared.glass) : (materials?.toon ?? shared.toon)
  })
  return copy
}

let meta: Record<string, PropMeta> | null = null
export async function loadPropMeta(): Promise<Record<string, PropMeta>> {
  if (meta) return meta
  try {
    const response = await fetch(assetUrl("models/props_meta.json"))
    meta = (await response.json()) as Record<string, PropMeta>
  } catch {
    meta = {}
  }
  return meta
}
