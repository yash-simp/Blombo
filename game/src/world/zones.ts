// Draws the islands: terrain, water, instanced props, NPCs, lantern halos and fireflies. Zones load when
// the player is near them and unload far away; all objects are game.local cosmetics.
import {
  CanvasTexture,
  Group,
  Matrix4,
  Mesh,
  type Material,
  Object3D,
  Quaternion,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  Float32BufferAttribute,
} from "three"
import { ZONES } from "../../server/rules.ts"
import { mergeItems, type MergeItem } from "./merge"
import { settings } from "./quality"
import { assetUrl, loadPack } from "../assets/gltf"
import { cloneRoot, hasRoot, loadPackRoots, loadPropMeta, materialKind, propParts } from "../assets/packs"
import { packMaterials } from "../assets/materials"
import { WATER_PALETTES, waterMaterial, waterUniforms } from "./water"
import { Billboards } from "./billboards"
import { nightFactor } from "../sky"

const Y_AXIS = new Vector3(0, 1, 0)
const ZONE_KEYS = ["lantern", "willow", "coral", "frost", "ember", "moon"]
/**
 * Props are baked into one mesh per CHUNK-metre square and material. How far a prop is drawn depends
 * on its tier (quality.ts sets the distances):
 * - clutter (grass, flowers, pebbles...): only in chunks near the player, never casting shadows;
 * - medium (bushes, lamps, fences...): with full detail, no shadows, gone in far chunks;
 * - everything else is large: full detail and sun shadows nearby, a decimated "__lod" copy far away.
 */
/** Clutter chunks (metres); detail and far meshes share a coarser grid so one replaces the other. */
const CLUTTER_CHUNK = 32
const CHUNK = 48
/** Far copies keep their glowing parts only for props whose glow reads from afar (halos stand in for lamps). */
const FAR_GLOW = new Set(["tree_mushroom", "moon_shrine", "forge_hut", "crystal_ice", "crystal_ember", "crystal_moon", "lighthouse"])
const CLUTTER = new Set(["grass", "grass_dry", "flowers_pink", "flowers_yellow", "flowers_blue", "flowers_glow", "mushrooms_red", "mushrooms_glow", "shells", "reeds", "cattails", "lilypad", "rock_s", "bucket_worms", "crate_fish", "crate", "barrel", "stump", "log", "seaweed", "coral_fan", "coral_branch", "coral_brain", "lantern_ground", "rock_sand", "sandcastle", "surfboard", "gift_box"])
const MEDIUM = new Set(["bush_a", "bush_b", "bush_c", "bush_snow", "bush_ember", "bush_moon", "rock_m", "rock_ice", "rock_moon", "lantern_post", "fence_3", "bench", "signpost", "net_rack", "rod_rack", "campfire", "buoy", "umbrella", "torch_tiki", "stone_lantern", "crystal_ice", "crystal_ember", "crystal_moon", "steam_vent", "haybale", "snowman", "well", "notice_board", "pier_post", "plaza_disc"])
/** Large props over water: water receives no sun shadow, so they never cast. */
const NO_SHADOW = new Set(["dock_4", "dock_end", "home_plot", "boardwalk_4", "bridge_wood", "stone_bridge", "boat_rowboat", "boat_sailboat", "boat_steamer", "boat_yacht", "plaza_disc"])
/** Drawn as their own object (animated). */
const UNMERGED = new Set(["mill_wheel"])
const HALO_COLORS: Record<string, number> = { torch_tiki: 0xffa040, campfire: 0xff9a40, stone_lantern: 0x9fd8ff, moon_shrine: 0xd8e8ff, buoy: 0xfff0a0, forge_hut: 0xff7a2a }

/** NPC models by anchor name; zone merchants are the zone's own keeper. */
const MERCHANT = ["market", "willow", "coral", "frost", "ember", "moon"]
export const NPC_ANCHORS = ["guide", "market", "tackle", "captain", "host"]

export interface Npc {
  key: string
  zone: number
  root: Object3D
  head: Object3D | null
  armL: Object3D | null
  armR: Object3D | null
  base: Vector3
  yaw: number
  wave: number
  label: Sprite
  mark: Sprite | null
}

interface ZoneData {
  key: string
  instances: [string, number, number, number, number, number][]
  anchors: Record<string, number[] | number[][]>
}

/** What the world needs from the game (a sight module passes a stub). */
export interface WorldHost {
  t(key: string): string
  local: { add(object: Object3D, cleanup: () => void): () => void }
}

type Tier = "clutter" | "detail" | "far"
interface Chunk {
  /** Zone-local centre and size. */
  x: number
  z: number
  size: number
  meshes: { mesh: Mesh; tier: Tier; casts: boolean }[]
}
interface TerrainChunk {
  x: number
  z: number
  full: Mesh
  far: Mesh | null
}

export interface ZoneView {
  chunks: Chunk[]
  terrain: TerrainChunk[]
  sea: Mesh
  index: number
  group: Group
  data: ZoneData
  npcs: Npc[]
  halos: Billboards
  flies: Billboards
  wheel: Object3D | null
  release: () => void
}

export function makeLabel(text: string, sub: string, color: string): Sprite {
  const canvas = document.createElement("canvas")
  canvas.width = 512
  canvas.height = 160
  const ctx = canvas.getContext("2d")!
  ctx.font = "900 64px Rubik, sans-serif"
  ctx.textAlign = "center"
  ctx.lineJoin = "round"
  ctx.lineWidth = 12
  ctx.strokeStyle = "#0b1a2a"
  ctx.strokeText(text, 256, 70)
  ctx.fillStyle = color
  ctx.fillText(text, 256, 70)
  if (sub) {
    ctx.font = "900 42px Rubik, sans-serif"
    ctx.lineWidth = 9
    ctx.strokeText(sub, 256, 132)
    ctx.fillStyle = "#ffffff"
    ctx.fillText(sub, 256, 132)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }))
  sprite.scale.set(3.2, 1.0, 1)
  return sprite
}

function makeMark(): Sprite {
  const canvas = document.createElement("canvas")
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext("2d")!
  ctx.beginPath()
  ctx.arc(64, 64, 54, 0, Math.PI * 2)
  ctx.fillStyle = "#ffcf3a"
  ctx.fill()
  ctx.lineWidth = 10
  ctx.strokeStyle = "#7a4a00"
  ctx.stroke()
  ctx.font = "900 92px Rubik, sans-serif"
  ctx.textAlign = "center"
  ctx.fillStyle = "#3a2000"
  ctx.fillText("!", 64, 96)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }))
  sprite.scale.set(0.9, 0.9, 1)
  return sprite
}

export class World {
  readonly zones = new Map<number, ZoneView>()
  private loading = new Set<number>()
  /** Zones kept loaded wherever the player is (the boat ride's destination). */
  readonly pinned = new Set<number>()
  /** Zones whose files failed to load are not retried every frame. */
  private failed = new Set<number>()
  private readonly q = new Quaternion()
  private readonly s = new Vector3()
  private readonly p = new Vector3()
  private ocean: Mesh | null = null
  private ready: Promise<void> | null = null
  /** Called when a zone finished loading (the HUD hides its loading hint). */
  onZoneLoaded: (zone: number) => void = () => {}
  /** The open-sea ring around islands (off for close-up sight shots). */
  drawSea = true

  constructor(private readonly game: WorldHost) {}

  /** Loads the shared packs once. */
  init(): Promise<void> {
    if (!this.ready) {
      this.ready = Promise.all([loadPackRoots("models/props.glb"), loadPackRoots("models/items.glb"), loadPackRoots("models/chars.glb"), loadPropMeta()]).then(() => undefined)
    }
    return this.ready
  }

  /** Loads zones near the player and drops far ones. */
  async update(px: number, pz: number, dt: number): Promise<void> {
    for (let i = 0; i < ZONES.length; i++) {
      const z = ZONES[i]!
      const d = Math.hypot(px - z.x, pz - z.z)
      const keep = this.pinned.has(i)
      if ((d < 260 || keep) && !this.zones.has(i) && !this.loading.has(i) && !this.failed.has(i)) void this.load(i)
      if (d > 340 && !keep && this.zones.has(i)) {
        this.zones.get(i)!.release()
        this.zones.delete(i)
      }
    }
    this.animate(px, pz, dt)
  }

  nearestZone(px: number, pz: number): number {
    let best = 0
    let bestD = Infinity
    ZONES.forEach((z, i) => {
      const d = Math.hypot(px - z.x, pz - z.z)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best
  }

  async load(index: number): Promise<void> {
    this.loading.add(index)
    try {
      await this.init()
      const key = ZONE_KEYS[index]!
      const [gltf, data] = await Promise.all([
        loadPack(`models/zone_${key}.glb`),
        fetch(assetUrl(`models/zone_${key}.json`)).then((r) => r.json() as Promise<ZoneData>),
      ])
      const view = await this.build(index, gltf.scene, data)
      this.zones.set(index, view)
      this.onZoneLoaded(index)
    } catch (error) {
      console.warn("zone load failed", index, error)
      this.failed.add(index)
    } finally {
      this.loading.delete(index)
    }
  }

  private async build(index: number, scene: Object3D, data: ZoneData): Promise<ZoneView> {
    const center = ZONES[index]!
    const mats = packMaterials()
    const meta = await loadPropMeta()
    const group = new Group()
    group.position.set(center.x, 0, center.z)
    const disposables: { dispose(): void }[] = []
    const water = waterMaterial(WATER_PALETTES[index]!)
    disposables.push(water)
    // terrain chunks (full + "__lod"), water, paths and special meshes from the zone pack
    const terrainChunks = new Map<string, TerrainChunk>()
    const pack = scene.clone(true)
    pack.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      const kind = materialKind((mesh.material as Material).name)
      const isTerrain = o.name.startsWith("terrain")
      mesh.material = kind === "water" ? water : kind === "glow" ? mats.glow : o.name.startsWith("paths") || isTerrain ? mats.toonFlat : mats.toon
      if (kind === "water") mesh.renderOrder = 2
      if (isTerrain) {
        const key = o.name.replace(/__lod$/, "")
        mesh.geometry.computeBoundingBox()
        const box = mesh.geometry.boundingBox!
        const entry = terrainChunks.get(key) ?? { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2, full: mesh, far: null }
        if (o.name.endsWith("__lod")) entry.far = mesh
        else entry.full = mesh
        terrainChunks.set(key, entry)
      }
    })
    group.add(pack)
    // the open sea around the island (drawn for the nearest island only)
    const ring = new RingGeometry(149.5, 900, 64, 1)
    ring.rotateX(-Math.PI / 2)
    const count = ring.getAttribute("position").count
    const colors = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) colors.set([1, 0, 0, 1], i * 4)
    ring.setAttribute("color", new Float32BufferAttribute(colors, 4))
    const sea = new Mesh(ring, water)
    sea.renderOrder = 1
    if (this.drawSea) group.add(sea)
    disposables.push(ring)
    // props, baked per chunk and material
    const halos = new Billboards(400, "halo")
    const flies = new Billboards(160, "firefly")
    disposables.push(halos, flies)
    let wheel: Object3D | null = null
    const buckets = new Map<string, { cx: number; cz: number; size: number; items: Map<string, MergeItem[]> }>()
    const add = (cx: number, cz: number, size: number, bucket: string, item: MergeItem) => {
      const key = size + ":" + cx + "," + cz
      let chunk = buckets.get(key)
      if (!chunk) buckets.set(key, (chunk = { cx, cz, size, items: new Map() }))
      const list = chunk.items.get(bucket)
      if (list) list.push(item)
      else chunk.items.set(bucket, [item])
    }
    const lights = new Map<string, number[][]>()
    for (const [name, x, y, z, yaw, scale] of data.instances) {
      if (!hasRoot(name)) continue
      if (UNMERGED.has(name)) {
        const obj = cloneRoot(name)
        if (obj) {
          obj.position.set(x, y, z)
          obj.rotation.order = "YXZ"
          obj.rotation.y = yaw
          obj.scale.setScalar(scale)
          group.add(obj)
          wheel = obj
        }
        continue
      }
      const clutter = CLUTTER.has(name)
      const medium = MEDIUM.has(name)
      const size = clutter ? CLUTTER_CHUNK : CHUNK
      const cx = (Math.floor(x / size) + 0.5) * size
      const cz = (Math.floor(z / size) + 0.5) * size
      this.p.set(x - cx, y, z - cz)
      this.q.setFromAxisAngle(Y_AXIS, yaw)
      this.s.setScalar(scale)
      const place = new Matrix4().compose(this.p, this.q, this.s)
      // medium props are small and many: their decimated copy reads the same at any distance
      const shown = medium && hasRoot(name + "__lod") ? name + "__lod" : name
      for (const part of propParts(shown)) {
        const material = part.kind === "toon" ? (clutter || medium || NO_SHADOW.has(name) ? "flat" : "toon") : part.kind
        add(cx, cz, size, (clutter ? "clutter" : "detail") + "|" + material, { geometry: part.geometry, matrix: new Matrix4().multiplyMatrices(place, part.matrix) })
      }
      if (!clutter && !medium) {
        const lod = hasRoot(name + "__lod") ? name + "__lod" : name
        for (const part of propParts(lod)) {
          if (part.kind === "glow" && !FAR_GLOW.has(name)) continue
          add(cx, cz, size, "far|" + (part.kind === "toon" ? "flat" : part.kind), { geometry: part.geometry, matrix: new Matrix4().multiplyMatrices(place, part.matrix) })
        }
      }
      if (!lights.has(name)) {
        const anchors = meta[name]?.anchors ?? {}
        lights.set(name, Object.entries(anchors).filter(([k, a]) => k.startsWith("light") && Array.isArray(a)).map(([, a]) => a as number[]))
      }
      // halos at the prop's light anchors
      for (const a of lights.get(name)!) {
        const c = Math.cos(yaw)
        const sn = Math.sin(yaw)
        const lx = (a[0] ?? 0) * scale
        const lz = (a[2] ?? 0) * scale
        halos.add(center.x + x + lx * c + lz * sn, y + (a[1] ?? 0) * scale, center.z + z - lx * sn + lz * c, name === "campfire" ? 2.6 : 1.5, HALO_COLORS[name] ?? 0xffc864)
      }
    }
    const chunks: Chunk[] = []
    for (const b of buckets.values()) {
      const chunk: Chunk = { x: b.cx, z: b.cz, size: b.size, meshes: [] }
      for (const [bucket, items] of b.items) {
        const geometry = mergeItems(items)
        if (!geometry) continue
        disposables.push(geometry)
        const [tier, kind] = bucket.split("|") as [Tier, string]
        const material = kind === "glow" ? mats.glow : kind === "glass" ? mats.glass : kind === "water" ? water : kind === "toon" ? mats.toon : mats.toonFlat
        const mesh = new Mesh(geometry, material)
        mesh.name = "chunk:" + bucket
        mesh.position.set(b.cx, 0, b.cz)
        if (kind === "water") mesh.renderOrder = 2
        mesh.visible = tier === "detail"
        group.add(mesh)
        chunk.meshes.push({ mesh, tier, casts: kind === "toon" })
      }
      chunks.push(chunk)
    }
    // fireflies over the meadows and the shore
    const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const r = rng(1234 + index)
    const FIREFLY_PROPS = new Set(["flowers_yellow", "flowers_pink", "reeds", "cattails", "bush_a", "flowers_glow", "mushrooms_glow", "bush_moon", "tree_palm", "bush_ember", "bush_snow"])
    const land = data.instances.filter((i) => FIREFLY_PROPS.has(i[0]))
    for (let k = 0; k < 140 && land.length; k++) {
      const pick = land[Math.floor(r() * land.length)]!
      flies.add(center.x + pick[1] + (r() - 0.5) * 4, pick[2] + 0.6 + r() * 1.8, center.z + pick[3] + (r() - 0.5) * 4, 0.42, k % 5 === 0 ? 0x9fffe0 : 0xd8ff7a)
    }
    // NPCs
    const npcs: Npc[] = []
    for (const key of NPC_ANCHORS) {
      const a = data.anchors[key] as number[] | undefined
      if (!a || typeof a[0] !== "number") continue
      const model = key === "market" ? MERCHANT[index]! : key
      const root = cloneRoot(model)
      if (!root) continue
      const base = new Vector3(center.x + a[0], a[1] ?? 1, center.z + (a[2] ?? 0))
      root.position.copy(base)
      root.rotation.y = a[3] ?? 0
      const find = (part: string) => root.getObjectByName(model + "_" + part) ?? null
      const label = makeLabel(this.game.t(`npc.${key === "market" ? "market" + index : key}`), this.game.t(`npc.role.${key}`), key === "guide" ? "#ffd34d" : "#9fe9ff")
      label.position.set(0, 2.85, 0)
      root.add(label)
      let mark: Sprite | null = null
      if (key === "guide") {
        mark = makeMark()
        mark.position.set(0, 3.55, 0)
        root.add(mark)
      }
      group.add(root)
      // NPC objects are children of the zone group: undo its offset
      root.position.sub(group.position)
      npcs.push({ key, zone: index, root, head: find("head"), armL: find("armL"), armR: find("armR"), base, yaw: a[3] ?? 0, wave: 0, label, mark })
    }
    group.add(halos.mesh)
    group.add(flies.mesh)
    halos.mesh.position.set(-center.x, 0, -center.z)
    flies.mesh.position.set(-center.x, 0, -center.z)
    const release = this.game.local.add(group, () => {
      for (const d of disposables) d.dispose()
      for (const n of npcs) {
        ;(n.label.material as SpriteMaterial).map?.dispose()
        n.label.material.dispose()
        if (n.mark) {
          ;(n.mark.material as SpriteMaterial).map?.dispose()
          n.mark.material.dispose()
        }
      }
    })
    return { index, group, data, npcs, halos, flies, wheel, release, chunks, terrain: [...terrainChunks.values()], sea }
  }

  private lodTimer = 0
  /** A point that overrides the player for level of detail (the boat during a ride). */
  focus: Vector3 | null = null
  /** Shows each chunk's tiers by its distance from the player and the quality setting. */
  private refreshChunks(view: ZoneView, px: number, pz: number): void {
    const c = ZONES[view.index]!
    const q = settings()
    const lx = px - c.x
    const lz = pz - c.z
    for (const chunk of view.chunks) {
      const d = Math.max(0, Math.hypot(chunk.x - lx, chunk.z - lz) - chunk.size * 0.71)
      const detail = d < q.detail
      for (const m of chunk.meshes) {
        m.mesh.visible = m.tier === "clutter" ? d < q.clutter : m.tier === "detail" ? detail : !detail
        if (m.casts) m.mesh.material = q.shadows ? packMaterials().toon : packMaterials().toonFlat
      }
    }
    for (const t of view.terrain) {
      const d = Math.max(0, Math.hypot(t.x - lx, t.z - lz) - 57)
      const full = !t.far || d < q.terrain
      t.full.visible = full
      if (t.far) t.far.visible = !full
    }
  }

  private animate(px: number, pz: number, dt: number): void {
    const t = performance.now() / 1000
    this.lodTimer -= dt
    const fx = this.focus?.x ?? px
    const fz = this.focus?.z ?? pz
    const nearest = this.nearestZone(fx, fz)
    for (const view of this.zones.values()) view.sea.visible = this.drawSea && view.index === nearest
    for (const view of this.zones.values()) if (view.wheel) view.wheel.rotation.x -= dt * 0.9
    const night = nightFactor()
    waterUniforms.night.value = night
    waterUniforms.light.value = 1 - night * 0.45
    const refreshed = this.lodTimer <= 0
    if (refreshed) this.lodTimer = 0.25
    for (const view of this.zones.values()) {
      view.halos.intensity.value = 0.25 + night * 1.05
      view.flies.intensity.value = night * 1.2
      view.flies.mesh.visible = night > 0.05 && settings().fireflies
      if (refreshed) this.refreshChunks(view, fx, fz)
      for (const npc of view.npcs) {
        const dx = px - npc.base.x
        const dz = pz - npc.base.z
        const d = Math.hypot(dx, dz)
        // face the player when near, else the authored direction
        const target = d < 9 ? Math.atan2(dx, dz) : npc.yaw
        let diff = target - npc.root.rotation.y
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        npc.root.rotation.y += diff * Math.min(1, dt * 4)
        npc.root.position.y = npc.base.y + Math.sin(t * 2 + npc.base.x) * 0.02
        if (npc.head) npc.head.rotation.y = Math.sin(t * 0.7 + npc.base.z) * 0.18
        npc.wave = Math.max(0, npc.wave - dt)
        const waving = d < 7 || npc.wave > 0
        if (npc.armR) npc.armR.rotation.x = waving ? -2.6 + Math.sin(t * 8) * 0.35 : Math.sin(t * 1.5) * 0.06
        if (npc.armR) npc.armR.rotation.z = waving ? -0.2 : 0
        if (npc.armL) npc.armL.rotation.x = -Math.sin(t * 1.5) * 0.06
        if (npc.mark) {
          npc.mark.position.y = 3.55 + Math.sin(t * 3) * 0.12
        }
      }
    }
  }

  /** NPC by key in the zone the player is in. */
  npcNear(px: number, pz: number, range: number): Npc | null {
    let best: Npc | null = null
    let bestD = range
    for (const view of this.zones.values()) {
      for (const npc of view.npcs) {
        const d = Math.hypot(px - npc.base.x, pz - npc.base.z)
        if (d < bestD) {
          bestD = d
          best = npc
        }
      }
    }
    return best
  }

  setGuideMark(visible: boolean): void {
    for (const view of this.zones.values()) for (const npc of view.npcs) if (npc.mark) npc.mark.visible = visible
  }

  anchor(zone: number, name: string): Vector3 | null {
    const view = this.zones.get(zone)
    const a = view?.data.anchors[name] as number[] | undefined
    const c = ZONES[zone]
    if (!a || !c || typeof a[0] !== "number") return null
    return new Vector3(c.x + a[0], a[1] ?? 1, c.z + (a[2] ?? 0))
  }
}
