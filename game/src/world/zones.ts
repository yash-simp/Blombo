// Draws the islands: terrain, water, instanced props, NPCs, lantern halos and fireflies. Zones load when
// the player is near them and unload far away; all objects are game.local cosmetics.
import {
  CanvasTexture,
  Group,
  InstancedMesh,
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
import { assetUrl, loadPack } from "../assets/gltf"
import { cloneRoot, hasRoot, loadPackRoots, loadPropMeta, materialKind, propParts } from "../assets/packs"
import { packMaterials } from "../assets/materials"
import { WATER_PALETTES, waterMaterial, waterUniforms } from "./water"
import { Billboards } from "./billboards"
import { nightFactor } from "../sky"

const Y_AXIS = new Vector3(0, 1, 0)
const ZONE_KEYS = ["lantern", "willow", "coral", "frost", "ember", "moon"]
/** Props drawn without a sun shadow (many small copies). */
const FLAT = new Set(["grass", "grass_dry", "flowers_pink", "flowers_yellow", "flowers_blue", "flowers_glow", "reeds", "cattails", "lilypad", "seaweed", "shells", "mushrooms_red", "mushrooms_glow", "plaza_disc", "buoy"])
/** Small dense props drawn only within NEAR_RANGE of the player (re-picked twice a second). */
const NEAR = new Set(["grass", "grass_dry", "flowers_pink", "flowers_yellow", "flowers_blue", "flowers_glow", "mushrooms_red", "mushrooms_glow", "shells", "reeds", "cattails", "lilypad", "rock_s", "bucket_worms", "crate_fish", "stump", "log", "seaweed", "coral_fan", "coral_branch", "coral_brain"])
const NEAR_RANGE = 48
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

interface NearSet {
  list: [string, number, number, number, number, number][]
  meshes: { mesh: InstancedMesh; matrix: Matrix4 }[]
}

export interface ZoneView {
  near: NearSet[]
  index: number
  group: Group
  data: ZoneData
  npcs: Npc[]
  halos: Billboards
  flies: Billboards
  wheel: Object3D | null
  release: () => void
}

function makeLabel(text: string, sub: string, color: string): Sprite {
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
  private readonly temp = new Matrix4()
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
    // terrain, water, paths and special meshes from the zone pack
    const terrain = scene.clone(true)
    terrain.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      const kind = materialKind((mesh.material as Material).name)
      mesh.material = kind === "water" ? water : kind === "glow" ? mats.glow : o.name.startsWith("paths") ? mats.toonFlat : mats.toon
      if (kind === "water") mesh.renderOrder = 2
    })
    group.add(terrain)
    // the open sea around the island
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
    // instanced props
    const byProp = new Map<string, ZoneData["instances"]>()
    for (const inst of data.instances) {
      const list = byProp.get(inst[0])
      if (list) list.push(inst)
      else byProp.set(inst[0], [inst])
    }
    const halos = new Billboards(400, "halo")
    const flies = new Billboards(160, "firefly")
    disposables.push(halos, flies)
    let wheel: Object3D | null = null
    const near: NearSet[] = []
    for (const [name, list] of byProp) {
      if (!hasRoot(name)) continue
      const parts = propParts(name)
      const nearMeshes: NearSet["meshes"] = []
      if (NEAR.has(name)) near.push({ list, meshes: nearMeshes })
      for (const part of parts) {
        const material =
          part.kind === "glow" ? mats.glow : part.kind === "glass" ? mats.glass : part.kind === "water" ? water : FLAT.has(name) ? mats.toonFlat : mats.toon
        const mesh = new InstancedMesh(part.geometry, material, list.length)
        if (NEAR.has(name)) {
          mesh.count = 0
          mesh.frustumCulled = false
          nearMeshes.push({ mesh, matrix: part.matrix })
        } else {
          list.forEach((inst, i) => {
            this.p.set(inst[1], inst[2], inst[3])
            this.q.setFromAxisAngle(Y_AXIS, inst[4])
            this.s.setScalar(inst[5])
            this.temp.compose(this.p, this.q, this.s).multiply(part.matrix)
            mesh.setMatrixAt(i, this.temp)
          })
          mesh.instanceMatrix.needsUpdate = true
          mesh.computeBoundingSphere()
        }
        if (part.kind === "water") mesh.renderOrder = 2
        group.add(mesh)
        disposables.push(mesh)
      }
      // halos at the props' light anchors
      const anchors = meta[name]?.anchors ?? {}
      for (const [anchorName, a] of Object.entries(anchors)) {
        if (!anchorName.startsWith("light") || !Array.isArray(a)) continue
        for (const inst of list) {
          const c = Math.cos(inst[4])
          const s = Math.sin(inst[4])
          const lx = (a[0] ?? 0) * inst[5]
          const lz = (a[2] ?? 0) * inst[5]
          halos.add(center.x + inst[1] + lx * c + lz * s, inst[2] + (a[1] ?? 0) * inst[5], center.z + inst[3] - lx * s + lz * c, name === "campfire" ? 2.6 : 1.5, HALO_COLORS[name] ?? 0xffc864)
        }
      }
    }
    // fireflies over the meadows and the shore
    const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const r = rng(1234 + index)
    const land = data.instances.filter((i) => i[0] === "flowers_yellow" || i[0] === "reeds" || i[0] === "cattails" || i[0] === "bush_a")
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
    void wheel
    return { index, group, data, npcs, halos, flies, wheel, release, near }
  }

  private nearTimer = 0
  /** Re-picks the nearby copies of small props. */
  private refreshNear(view: ZoneView, px: number, pz: number): void {
    const c = ZONES[view.index]!
    const lx = px - c.x
    const lz = pz - c.z
    for (const set of view.near) {
      let n = 0
      for (const inst of set.list) {
        const dx = inst[1] - lx
        const dz = inst[3] - lz
        if (dx * dx + dz * dz > NEAR_RANGE * NEAR_RANGE) continue
        this.p.set(inst[1], inst[2], inst[3])
        this.q.setFromAxisAngle(Y_AXIS, inst[4])
        this.s.setScalar(inst[5])
        for (const m of set.meshes) {
          this.temp.compose(this.p, this.q, this.s).multiply(m.matrix)
          m.mesh.setMatrixAt(n, this.temp)
        }
        n++
      }
      for (const m of set.meshes) {
        m.mesh.count = n
        m.mesh.instanceMatrix.needsUpdate = true
      }
    }
  }

  private animate(px: number, pz: number, dt: number): void {
    const t = performance.now() / 1000
    this.nearTimer -= dt
    if (this.nearTimer <= 0) {
      this.nearTimer = 0.5
      for (const view of this.zones.values()) this.refreshNear(view, px, pz)
    }
    const night = nightFactor()
    waterUniforms.night.value = night
    waterUniforms.light.value = 1 - night * 0.45
    for (const view of this.zones.values()) {
      view.halos.intensity.value = 0.25 + night * 1.05
      view.flies.intensity.value = night * 1.2
      view.flies.mesh.visible = night > 0.05
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
