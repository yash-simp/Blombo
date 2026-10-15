// Fishing on this screen: aim and power, the cast arc, bobber, line, bite, the reel fight, the catch
// showcase, and everyone else's lines and bobbers. The server decides every outcome.
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  SRGBColorSpace,
  Vector3,
} from "three"
import { reactive } from "vue"
import type { IGame } from "@blombo/game-runtime"
import { RODS, SPECIES, tapPower, zoneAt } from "../../server/rules.ts"
import { isWater, nearestWater } from "../../server/world.ts"
import { on, store } from "../net"
import { Fight } from "./fight"
import { cloneRoot } from "../assets/packs"
import { loadPackRoots } from "../assets/packs"
import { Fx } from "../world/fx"
import { packMaterials, vertexToon } from "../assets/materials"

/** Seconds to wait for the server's answer to a Hook or Reel before giving up on that fish. */
const LANDING_TIMEOUT_S = 6
/** How long the "wait for the splash" hint stays after a tap before the bite. */
const EARLY_HINT_MS = 1600
/** How far the fish comes towards the rod as the catch meter fills (0..1 of the line). */
const REEL_IN = 0.45

export type Phase = "idle" | "charging" | "flying" | "waiting" | "bite" | "reeling" | "landing"

export interface FightView {
  /** The catch meter, 0..1 (full = caught). */
  progress: number
  rarity: number
  perfect: boolean
  /** Counted taps: changes on every tap that counted (the HUD bumps on it). */
  taps: number
  /** The fish is surging: pulling harder for a moment. */
  surge: boolean
}

export interface CatchView {
  s: number
  g: number
  sh: boolean
  perfect: boolean
  coins: number
  xp: number
  isNew: boolean
  first: boolean
  uid: number
}

/** What the HUD shows about fishing. */
export const fishUi = reactive({
  phase: "idle" as Phase,
  power: 0,
  valid: false,
  hint: "",
  fight: null as FightView | null,
  catchCard: null as CatchView | null,
  escaped: null as { r: number; rehook: boolean } | null,
  nothing: false,
})

const tmp = new Vector3()
const tmp2 = new Vector3()
const tmp3 = new Vector3()

/** A thin camera-facing strip through a polyline (the fishing line). */
class Line {
  readonly mesh: Mesh
  private readonly pos: Float32Array
  private readonly geo = new BufferGeometry()
  constructor(
    private readonly n = 16,
    private readonly width = 0.022,
    color = 0xf4f8ff,
  ) {
    this.pos = new Float32Array((n + 1) * 2 * 3)
    this.geo.setAttribute("position", new BufferAttribute(this.pos, 3))
    const idx: number[] = []
    for (let i = 0; i < n; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    this.geo.setIndex(idx)
    this.mesh = new Mesh(this.geo, new MeshBasicMaterial({ color, side: DoubleSide, transparent: true, opacity: 0.85 }))
    this.mesh.frustumCulled = false
  }
  set(a: Vector3, b: Vector3, sag: number, eye: Vector3): void {
    for (let i = 0; i <= this.n; i++) {
      const t = i / this.n
      tmp.lerpVectors(a, b, t)
      tmp.y -= sag * 4 * t * (1 - t)
      // side vector: perpendicular to the line and to the eye direction
      tmp2.subVectors(b, a).normalize()
      const ex = eye.x - tmp.x
      const ey = eye.y - tmp.y
      const ez = eye.z - tmp.z
      let sx = tmp2.y * ez - tmp2.z * ey
      let sy = tmp2.z * ex - tmp2.x * ez
      let sz = tmp2.x * ey - tmp2.y * ex
      const l = Math.hypot(sx, sy, sz) || 1
      const w = this.width * (0.6 + 0.4 * Math.min(4, Math.hypot(ex, ey, ez) / 6))
      sx = (sx / l) * w
      sy = (sy / l) * w
      sz = (sz / l) * w
      this.pos.set([tmp.x - sx, tmp.y - sy, tmp.z - sz, tmp.x + sx, tmp.y + sy, tmp.z + sz], i * 6)
    }
    ;(this.geo.getAttribute("position") as BufferAttribute).needsUpdate = true
  }
  dispose(): void {
    this.geo.dispose()
    ;(this.mesh.material as MeshBasicMaterial).dispose()
  }
}

interface Rig {
  root: Group
  bobber: Object3D
  line: Line
  from: Vector3
  to: Vector3
  t: number
  flight: number
  bite: number
  thrash: number
}

function textSprite(text: string, color: string, bg: string): Sprite {
  const c = document.createElement("canvas")
  c.width = 128
  c.height = 128
  const ctx = c.getContext("2d")!
  ctx.beginPath()
  ctx.arc(64, 64, 56, 0, Math.PI * 2)
  ctx.fillStyle = bg
  ctx.fill()
  ctx.lineWidth = 8
  ctx.strokeStyle = "#1a1a1a"
  ctx.stroke()
  ctx.font = "900 96px Rubik, sans-serif"
  ctx.textAlign = "center"
  ctx.fillStyle = color
  ctx.fillText(text, 64, 98)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }))
}

export class Fishing {
  readonly fx = new Fx()
  private readonly root = new Group()
  private readonly ring: Mesh
  private readonly mine: Rig
  private readonly others = new Map<string, Rig>()
  private readonly bang: Sprite
  private fight: Fight | null = null
  /** Elapsed fight time of the last tap splash (a few splashes a second at most). */
  private tapSplashAt = -1
  private chargeT = 0
  private target = new Vector3()
  private castId = 0
  private biteAt = 0
  private winEnd = 0
  /** Until when the "wait for the splash" hint shows (performance.now ms). */
  private earlyUntil = 0
  private nibble = 0
  private jumpTimer = 2
  private jumper: { obj: Object3D; t: number; from: Vector3; dir: Vector3 } | null = null
  private shadowFish: Object3D | null = null
  private showcase: { obj: Object3D; t: number; from: Vector3 } | null = null
  private fishReady: Promise<void> | null = null
  private castOrigin = new Vector3()
  private readonly offs: (() => void)[] = []
  private releaseLocal: () => void
  onCaught: (c: CatchView) => void = () => {}
  /** A Cast is on its way to the server (no CastOk yet). */
  private awaitingCast = false
  /** The player cancelled before CastOk: cancel that cast when its id arrives. */
  private cancelOnOk = false
  /** When the hook or the final reel was sent; no answer within LANDING_TIMEOUT_S frees the controls. */
  private landingSince = 0

  constructor(private readonly game: IGame) {
    const ringGeo = new RingGeometry(0.55, 0.75, 32)
    ringGeo.rotateX(-Math.PI / 2)
    this.ring = new Mesh(ringGeo, new MeshBasicMaterial({ color: 0x5fff8a, transparent: true, opacity: 0.85, depthWrite: false }))
    this.ring.visible = false
    this.root.add(this.ring)
    this.mine = this.makeRig()
    this.bang = textSprite("!", "#3a2000", "#ffcf3a")
    this.bang.scale.set(0.8, 0.8, 1)
    this.bang.visible = false
    this.root.add(this.bang)
    this.fx.attachTo(this.root)
    this.releaseLocal = game.local.add(this.root, () => {
      ringGeo.dispose()
      ;(this.ring.material as MeshBasicMaterial).dispose()
      this.mine.line.dispose()
      for (const r of this.others.values()) r.line.dispose()
      this.fx.dispose()
    })
    this.offs.push(
      on("CastOk", (p) => this.onCastOk(p)),
      on("CastNo", () => {
        this.awaitingCast = false
        this.cancelOnOk = false
        this.reset()
      }),
      on("Hooked", (p) => this.onHooked(p.id, p.d, p.r)),
      on("Caught", (p) => this.onCaught2(p)),
      on("Escaped", (p) => this.onEscaped(p.r, p.rehook)),
      on("Fx", (p) => this.onFx(p)),
    )
  }

  private makeRig(): Rig {
    const root = new Group()
    const bobber = cloneRoot("bobber") ?? new Group()
    bobber.scale.setScalar(1.8)
    root.add(bobber)
    const line = new Line()
    root.add(line.mesh)
    root.visible = false
    this.root.add(root)
    return { root, bobber, line, from: new Vector3(), to: new Vector3(), t: 0, flight: 0, bite: 0, thrash: 0 }
  }

  /** The fish models load on first need. */
  private ensureFish(): Promise<void> {
    if (!this.fishReady) this.fishReady = loadPackRoots("models/fish.glb")
    return this.fishReady
  }

  get phase(): Phase {
    return fishUi.phase
  }

  private set(phase: Phase, hint = ""): void {
    fishUi.phase = phase
    fishUi.hint = hint
  }

  private rod() {
    return RODS[store.me?.rod ?? 0] ?? RODS[0]!
  }

  // ───────────── input ─────────────
  press(): void {
    if (!store.me || store.me.tut < 1) return
    switch (fishUi.phase) {
      case "idle":
        fishUi.catchCard = null
        fishUi.escaped = null
        this.chargeT = 0
        this.set("charging", "hint.release")
        void this.ensureFish()
        return
      case "flying":
      case "waiting":
        // A tap before the bite never loses the fish: it only says to wait (the small Reel in button
        // or walking away winds the line in). An empty water has nothing to wait for.
        if (fishUi.nothing) return this.reelIn()
        this.earlyUntil = performance.now() + EARLY_HINT_MS
        this.set(fishUi.phase, "hint.too_early")
        return
      case "bite":
        this.game.remotes.send("Hook", this.castId)
        this.bang.visible = false
        this.set("landing", "")
        return
      case "reeling":
        if (this.fight?.tap()) this.onTap()
        return
    }
  }

  release(): void {
    if (fishUi.phase === "charging") this.cast()
  }

  cancel(): void {
    if (fishUi.phase === "charging") this.set("idle")
  }

  /** Winds in a line with no fish on it (the small Reel in button while waiting). */
  reelIn(): void {
    if (fishUi.phase !== "flying" && fishUi.phase !== "waiting") return
    if (this.awaitingCast) this.cancelOnOk = true
    else this.game.remotes.send("CancelCast", this.castId)
    this.reset()
  }

  /** A counted tap (the player's or Auto-Reel's): the HUD bumps, the line jerks, the water splashes. */
  private onTap(): void {
    const fight = this.fight
    if (!fight) return
    if (fishUi.fight) {
      fishUi.fight.progress = fight.progress
      fishUi.fight.taps = fight.taps
    }
    if (this.tapSplashAt < 0 || fight.elapsed - this.tapSplashAt > 0.45) {
      this.tapSplashAt = fight.elapsed
      const b = this.mine.bobber.position
      this.fx.splash(b.x, b.z, 0.4)
    }
  }

  private reset(): void {
    this.mine.root.visible = false
    this.ring.visible = false
    this.bang.visible = false
    this.fight = null
    fishUi.fight = null
    fishUi.nothing = false
    this.set("idle")
    this.game.hands.stop("rightArm")
  }

  private aim(): { x: number; z: number; ok: boolean } {
    const p = this.game.player.position
    const yaw = this.game.player.yaw
    const range = this.rod().range
    const dist = 3 + fishUi.power * (range - 3)
    let x = p.x - Math.sin(yaw) * dist
    let z = p.z - Math.cos(yaw) * dist
    const zone = zoneAt(p.x, p.z)
    const w = zone >= 0 ? nearestWater(zone, x, z, 3) : null
    if (w) {
      x = w.x
      z = w.z
    }
    return { x, z, ok: !!w && zone >= 0 && isWater(zone, x, z) }
  }

  private cast(): void {
    const a = this.aim()
    if (!a.ok) {
      this.set("idle", "hint.aim_water")
      this.ring.visible = false
      return
    }
    this.awaitingCast = true
    this.cancelOnOk = false
    if (!this.game.remotes.send("Cast", { x: a.x, z: a.z, p: fishUi.power })) {
      this.awaitingCast = false
      this.set("idle")
      return
    }
    this.target.set(a.x, 0.05, a.z)
    this.ring.visible = false
    this.castOrigin.copy(this.game.player.position as Vector3)
    this.game.hands.play("castswing", { mask: "rightArm" })
    this.set("flying", "")
    const tip = this.tipOf(null, tmp)
    this.mine.from.copy(tip)
    this.mine.to.copy(this.target)
    this.mine.t = 0
    this.mine.flight = 0.7
    this.mine.root.visible = true
  }

  // ───────────── server events ─────────────
  private onCastOk(p: { id: number; bite: number; d: number; r: number; first: boolean; none: boolean; win: number }): void {
    this.awaitingCast = false
    if (this.cancelOnOk) {
      this.cancelOnOk = false
      this.game.remotes.send("CancelCast", p.id)
      return
    }
    this.castId = p.id
    if (p.none) {
      fishUi.nothing = true
      this.set("waiting", "hint.nothing")
      window.setTimeout(() => {
        if (fishUi.phase === "waiting" && this.castId === p.id) {
          fishUi.nothing = false
          this.game.remotes.send("CancelCast", p.id)
          this.reset()
        }
      }, 3500)
      return
    }
    fishUi.nothing = false
    this.biteAt = performance.now() + p.bite
    this.winEnd = this.biteAt + p.win
    this.nibble = 0.8 + Math.random()
    if (fishUi.phase === "flying" || fishUi.phase === "waiting") this.set(fishUi.phase, "hint.wait")
  }

  private onHooked(id: number, d: number, r: number): void {
    this.castId = id
    this.fight = new Fight(d, tapPower(store.me?.rod ?? 0, store.me?.reel ?? 0))
    this.tapSplashAt = -1
    this.jumpTimer = 1.2
    this.mine.root.visible = true
    this.bang.visible = false
    if (this.mine.to.lengthSq() === 0) this.mine.to.copy(this.target)
    fishUi.fight = { progress: this.fight.progress, rarity: r, perfect: true, taps: 0, surge: false }
    this.set("reeling", "hint.tap_reel")
    this.fx.splash(this.mine.to.x, this.mine.to.z, 1.4)
    void this.ensureFish().then(() => {
      if (!this.shadowFish) {
        const fish = cloneRoot("pebble_perch", { toon: new MeshBasicMaterial({ color: 0x1b2f45 }), glow: new MeshBasicMaterial({ color: 0x1b2f45 }) })
        if (fish) {
          fish.visible = false
          this.root.add(fish)
          this.shadowFish = fish
        }
      }
    })
  }

  private onCaught2(c: CatchView): void {
    // the fish leaps from where it was reeled to (the bobber), not where the line first landed
    const at = this.mine.root.visible ? this.mine.bobber.position.clone().setY(0.05) : this.mine.to.clone()
    this.reset()
    fishUi.catchCard = { ...c }
    this.fx.splash(at.x, at.z, 1.8)
    if (c.sh) this.fx.sparkle(at.x, 0.8, at.z, 30, 3)
    void this.ensureFish().then(() => this.showFish(c.s, c.sh, at))
    this.onCaught(c)
  }

  private onEscaped(r: number, rehook: boolean): void {
    const at = this.mine.root.visible ? this.mine.bobber.position.clone() : this.mine.to.clone()
    this.reset()
    fishUi.escaped = { r, rehook }
    this.fx.splash(at.x, at.z, 1.2)
  }

  private onFx(p: { u: string; k: string; x: number; z: number; s: number; r: number; sh: boolean; g: number }): void {
    if (p.u === store.userId) return
    let rig = this.others.get(p.u)
    if (p.k === "cast") {
      if (!rig) {
        rig = this.makeRig()
        this.others.set(p.u, rig)
      }
      rig.from.copy(this.tipOf(p.u, tmp))
      rig.to.set(p.x, 0.05, p.z)
      rig.t = 0
      rig.flight = 0.7
      rig.thrash = 0
      rig.root.visible = true
    } else if (!rig) {
      if (p.k === "catch") this.fx.splash(p.x, p.z, 1.4)
      return
    } else if (p.k === "bite") {
      rig.bite = 0.6
      this.fx.splash(p.x, p.z, 0.8)
    } else if (p.k === "reel") {
      rig.thrash = 1
    } else {
      rig.root.visible = false
      this.fx.splash(p.x, p.z, p.k === "catch" ? 1.6 : 0.8)
      if (p.k === "catch" && p.sh) this.fx.sparkle(p.x, 0.8, p.z, 20)
    }
  }

  /** Where a rod tip is: the local hand when user is null, else that player's avatar. */
  private tipOf(userId: string | null, out: Vector3): Vector3 {
    let avatar = this.game.avatars.local
    if (userId) {
      const info = this.game.players.find((p) => p.userId === userId)
      avatar = info ? this.game.avatars.get(info.sessionId) : null
      if (!avatar && info) return out.set(info.x, info.y + 1.6, info.z)
    }
    if (avatar && avatar.itemSocketWorld("right", "tip", out)) return out
    const p = this.game.player.position
    return out.set(p.x - Math.sin(this.game.player.yaw) * 1.2, p.y + 1.9, p.z - Math.cos(this.game.player.yaw) * 1.2)
  }

  // ───────────── the catch showcase ─────────────
  private showFish(species: number, shiny: boolean, from: Vector3): void {
    const id = SPECIES[species]?.id
    if (!id) return
    if (this.showcase) {
      this.root.remove(this.showcase.obj)
      this.showcase = null
    }
    const toon = shiny ? vertexToon({ tint: 0xfff2b0 }) : packMaterials().toon
    const obj = cloneRoot(id, { toon })
    if (!obj) return
    this.root.add(obj)
    this.showcase = { obj, t: 0, from: from.clone() }
  }

  dismissShowcase(): void {
    if (this.showcase) this.root.remove(this.showcase.obj)
    this.showcase = null
  }

  // ───────────── per frame ─────────────
  update(dt: number): void {
    const eye = this.game.camera.position
    const now = performance.now()
    if (fishUi.phase === "landing") {
      this.landingSince += dt
      if (this.landingSince > LANDING_TIMEOUT_S) {
        this.game.remotes.send("CancelCast", this.castId)
        this.reset()
      }
    } else this.landingSince = 0
    // charging: power ping-pong and the landing ring
    if (fishUi.phase === "charging") {
      this.chargeT += dt
      fishUi.power = 0.5 - 0.5 * Math.cos(this.chargeT * Math.PI * 0.9)
      const a = this.aim()
      fishUi.valid = a.ok
      this.ring.visible = true
      this.ring.position.set(a.x, 0.08, a.z)
      ;(this.ring.material as MeshBasicMaterial).color.setHex(a.ok ? 0x5fff8a : 0xff5a5a)
      const s = 1 + Math.sin(now / 120) * 0.08
      this.ring.scale.set(s, 1, s)
    }
    // walking away from the cast cancels it
    if ((fishUi.phase === "waiting" || fishUi.phase === "bite") && this.castOrigin.distanceTo(this.game.player.position as Vector3) > 3.5) {
      this.game.remotes.send("CancelCast", this.castId)
      this.reset()
    }
    this.updateRig(this.mine, null, dt, eye, now)
    for (const [u, rig] of this.others) {
      if (!this.game.players.some((p) => p.userId === u)) {
        rig.root.visible = false
        this.others.delete(u)
        continue
      }
      this.updateRig(rig, u, dt, eye, now)
    }
    // bite timing for my line
    if (fishUi.phase === "waiting" && this.biteAt && !fishUi.nothing) {
      if (now >= this.biteAt) {
        this.set("bite", "hint.hook")
        this.bang.visible = true
        this.fx.splash(this.mine.to.x, this.mine.to.z, 1.1)
        try {
          navigator.vibrate?.(80)
        } catch {
          /* no vibration */
        }
      } else if (now > this.biteAt - this.nibble * 1000 && this.nibble > 0) {
        this.nibble = 0
        this.fx.splash(this.mine.to.x, this.mine.to.z, 0.45)
      }
    }
    if ((fishUi.phase === "waiting" || fishUi.phase === "flying") && fishUi.hint === "hint.too_early" && now > this.earlyUntil) {
      this.set(fishUi.phase, fishUi.phase === "waiting" ? "hint.wait" : "")
    }
    if (fishUi.phase === "bite") {
      this.bang.position.set(this.mine.to.x, 1.4 + Math.abs(Math.sin(now / 90)) * 0.25, this.mine.to.z)
      if (now > this.winEnd) {
        this.game.remotes.send("CancelCast", this.castId)
        this.reset()
        this.set("idle", "hud.too_slow")
        fishUi.escaped = { r: -1, rehook: false }
      }
    }
    // the fight
    if (fishUi.phase === "reeling" && this.fight) {
      const auto = store.me?.auto === true
      const taps = this.fight.taps
      this.fight.update(dt, auto)
      if (this.fight.taps !== taps) this.onTap()
      const f = fishUi.fight
      if (f) {
        f.progress = this.fight.progress
        f.perfect = this.fight.perfect && !auto
        f.taps = this.fight.taps
        f.surge = this.fight.surge > 0
      }
      this.jumpTimer -= dt
      if (this.jumpTimer <= 0 && this.shadowFish && !this.jumper) {
        this.jumpTimer = 2.2 + Math.random() * 2
        const dir = new Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
        const b = this.mine.bobber.position
        this.jumper = { obj: this.shadowFish, t: 0, from: new Vector3(b.x, 0, b.z), dir }
        this.shadowFish.visible = true
        this.fx.splash(b.x, b.z, 1.2)
      }
      if (this.fight.done) {
        // the finished fight stays until the answer (reset) so the fish stays where it was reeled to
        this.game.remotes.send("Reel", { id: this.castId, ok: this.fight.done === "caught", perfect: this.fight.perfect && !auto })
        this.set("landing", "")
      }
    }
    if (this.jumper) {
      const j = this.jumper
      j.t += dt / 0.9
      const t = Math.min(1, j.t)
      j.obj.position.set(j.from.x + j.dir.x * 1.6 * t, Math.sin(t * Math.PI) * 1.6, j.from.z + j.dir.z * 1.6 * t)
      j.obj.rotation.set(0, Math.atan2(-j.dir.z, j.dir.x), (0.5 - t) * 2.2)
      j.obj.scale.setScalar(0.55)
      if (j.t >= 1) {
        j.obj.visible = false
        this.fx.splash(j.obj.position.x, j.obj.position.z, 1)
        this.jumper = null
      }
    }
    // the showcase: the fish leaps from the water into view and spins in front of the camera
    if (this.showcase) {
      const s = this.showcase
      s.t += dt
      const cam = this.game.camera
      const fwd = cam.getWorldDirection(tmp2)
      const right = new Vector3().crossVectors(fwd, cam.up).normalize()
      const up = new Vector3().crossVectors(right, fwd).normalize()
      const spot = new Vector3().copy(cam.position).addScaledVector(fwd, 2.0).addScaledVector(up, -0.2)
      const k = Math.min(1, s.t / 0.7)
      const e = 1 - Math.pow(1 - k, 3)
      s.obj.position.lerpVectors(s.from, spot, e)
      s.obj.position.y += Math.sin(k * Math.PI) * 1.2
      s.obj.scale.setScalar(0.25 + 0.4 * e)
      s.obj.rotation.set(0, s.t * 1.6, Math.sin(s.t * 3) * 0.15)
      if (!fishUi.catchCard && s.t > 1) this.dismissShowcase()
    }
    this.fx.update(dt)
  }

  private updateRig(rig: Rig, userId: string | null, dt: number, eye: Vector3, now: number): void {
    if (!rig.root.visible) return
    const tip = this.tipOf(userId, tmp.clone())
    const b = rig.bobber.position
    if (rig.t < rig.flight) {
      rig.t += dt
      const k = Math.min(1, rig.t / rig.flight)
      b.lerpVectors(rig.from, rig.to, k)
      b.y += Math.sin(k * Math.PI) * (2.5 + rig.from.distanceTo(rig.to) * 0.12)
      if (k >= 1) {
        this.fx.splash(rig.to.x, rig.to.z, 0.7)
        if (rig === this.mine && fishUi.phase === "flying") this.set("waiting", "hint.wait")
      }
    } else {
      const reeling = rig === this.mine ? fishUi.phase === "reeling" || (fishUi.phase === "landing" && !!this.fight) : rig.thrash > 0
      const bite = rig === this.mine ? fishUi.phase === "bite" : rig.bite > 0
      rig.bite = Math.max(0, rig.bite - dt)
      const bob = Math.sin(now / 420) * 0.04
      let x = rig.to.x
      let z = rig.to.z
      let y = 0.05 + bob
      if (bite) y -= 0.18 + Math.abs(Math.sin(now / 70)) * 0.08
      if (reeling) {
        // My fight: the fish comes in as the meter fills, jerks towards the rod on each tap and thrashes
        // harder while it surges. Others' fish just thrash.
        const fight = rig === this.mine ? this.fight : null
        const surge = fight && fight.surge > 0 ? 1.7 : 1
        let pull = fight ? fight.progress * REEL_IN : 0
        if (fight && fight.sinceTap < 0.15) pull += 0.06 * (1 - fight.sinceTap / 0.15)
        tmp3.subVectors(tip, rig.to).setY(0)
        x += tmp3.x * pull + Math.sin(now / 130) * 0.3 * surge
        z += tmp3.z * pull + Math.cos(now / 170) * 0.3 * surge
        y -= 0.1
      }
      b.set(x, y, z)
    }
    let sag = rig.t < rig.flight ? 0.1 : 0.6
    if (rig === this.mine && this.fight) sag = this.fight.sinceTap < 0.15 ? 0.01 : 0.06
    rig.line.set(tip, b, sag, eye)
  }

  dispose(): void {
    for (const off of this.offs) off()
    this.releaseLocal()
  }
}
