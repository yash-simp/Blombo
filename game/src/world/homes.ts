// Home harbour life: each claimed plot gets an aquarium where the owner's chosen fish swim and a name
// board; the tournament champion wears the crown. Cosmetic only; the server owns homes and the crown.
import { Box3, Group, type Object3D, type Sprite, SpriteMaterial, Vector3 } from "three"
import type { IGame } from "@blombo/game-runtime"
import { SPECIES, ZONES } from "../../server/rules.ts"
import { cloneRoot, loadPackRoots } from "../assets/packs"
import type { World } from "./zones"
import { makeLabel } from "./zones"
import { store } from "../net"

/** The tank's water box in aquarium-local metres (see the aquarium prop) and the fish length in it. */
const TANK = { y: 1.38, x: 0.62, z: 0.22, h: 0.26 }
const FISH_LEN = 0.34
const DECK = 1.0

interface Tank {
  key: string
  root: Group
  label: Sprite
  fish: { obj: Object3D; phase: number; speed: number; depth: number }[]
}

export class Homes {
  private readonly root = new Group()
  private readonly tanks = new Map<number, Tank>()
  private fishReady: Promise<void> | null = null
  private loaded = false
  private crownOwner = ""
  private crown: Object3D | null = null
  private detachCrown: (() => void) | null = null
  private crownTimer = 0
  private readonly release: () => void

  constructor(
    private readonly game: IGame,
    private readonly world: World,
  ) {
    this.release = game.local.add(this.root, () => {
      for (const t of this.tanks.values()) this.disposeLabel(t.label)
    })
  }

  update(dt: number): void {
    const t = performance.now() / 1000
    this.syncTanks()
    for (const tank of this.tanks.values()) {
      for (const f of tank.fish) {
        const a = t * f.speed + f.phase
        f.obj.position.set(Math.cos(a) * TANK.x, TANK.y + f.depth + Math.sin(a * 1.7) * 0.05, Math.sin(a) * TANK.z)
        f.obj.rotation.y = Math.atan2(-Math.sin(a) * TANK.x, Math.cos(a) * TANK.z) + Math.PI / 2
      }
    }
    this.crownTimer -= dt
    if (this.crownTimer <= 0) {
      this.crownTimer = 1
      this.syncCrown()
    }
  }

  private syncTanks(): void {
    const view = this.world.zones.get(0)
    const plots = view?.data.anchors.plots as number[][] | undefined
    if (!plots) return
    const seen = new Set<number>()
    for (const home of store.homes) {
      const plot = plots[home.p]
      if (!plot) continue
      seen.add(home.p)
      const key = home.n + "|" + home.t + "|" + home.f.map((f) => f[0]).join(",")
      const old = this.tanks.get(home.p)
      if (old?.key === key) continue
      if (old) this.drop(home.p)
      if (home.f.length && !this.loaded) {
        this.fishReady ??= loadPackRoots("models/fish.glb").then(() => void (this.loaded = true))
        continue
      }
      this.tanks.set(home.p, this.build(plot, home.n, home.t, home.f, key))
    }
    for (const p of [...this.tanks.keys()]) if (!seen.has(p)) this.drop(p)
  }

  private build(plot: number[], name: string, title: string, fish: readonly (readonly number[])[], key: string): Tank {
    const c = ZONES[0]!
    const root = new Group()
    // the plot prop stands at the anchor turned by -yaw; its tank spot is 0.9 m toward the water
    const yaw = -(plot[3] ?? 0)
    root.position.set(c.x + plot[0]!, 0, c.z + plot[2]!)
    root.rotation.y = yaw
    const tank = cloneRoot("aquarium")
    if (tank) {
      tank.position.set(0, DECK, 0.9)
      root.add(tank)
    }
    const swim = new Group()
    swim.position.set(0, DECK, 0.9)
    root.add(swim)
    const label = makeLabel(name, title ? title : "", "#ffe27a")
    label.position.set(0, DECK + 2.7, -2.4)
    label.scale.set(2.6, 0.8, 1)
    root.add(label)
    const list: Tank["fish"] = []
    fish.slice(0, 6).forEach((f, i) => {
      const id = SPECIES[f[1]!]?.id
      const obj = id ? cloneRoot(id) : null
      if (!obj) return
      const size = new Box3().setFromObject(obj).getSize(new Vector3())
      obj.scale.setScalar(FISH_LEN / Math.max(0.01, size.x, size.z))
      swim.add(obj)
      list.push({ obj, phase: i * 1.7, speed: 0.5 + (i % 3) * 0.15, depth: ((i % 3) - 1) * 0.08 })
    })
    this.root.add(root)
    return { key, root, label, fish: list }
  }

  private drop(plot: number): void {
    const tank = this.tanks.get(plot)
    if (!tank) return
    this.root.remove(tank.root)
    this.disposeLabel(tank.label)
    this.tanks.delete(plot)
  }

  private disposeLabel(label: Sprite): void {
    ;(label.material as SpriteMaterial).map?.dispose()
    label.material.dispose()
  }

  /** The tournament winner wears the crown until the next round ends. */
  private syncCrown(): void {
    const owner = store.tourney?.crown ?? ""
    if (owner === this.crownOwner && (this.detachCrown || !owner)) return
    this.detachCrown?.()
    this.detachCrown = null
    this.crownOwner = owner
    if (!owner) return
    this.crown ??= cloneRoot("crown")
    if (!this.crown) return
    const info = this.game.players.find((p) => p.userId === owner)
    const avatar = owner === store.userId ? this.game.avatars.local : info ? this.game.avatars.get(info.sessionId) : null
    if (!avatar) return
    this.crown.position.set(0, 0.34, 0)
    this.crown.scale.setScalar(1.4)
    this.detachCrown = avatar.attach("head", this.crown)
  }

  dispose(): void {
    this.detachCrown?.()
    this.release()
  }
}
