// The tournament stage show in Lantern Lake: a big scoreboard behind the stage (title, the live clock or
// the next start, the top 3, the champion with the crown between rounds), marquee bulbs that chase and
// searchlights that sweep while a round is live, and a firework show when a round starts and ends.
// Built only while Lantern Lake (zone 0) is loaded; everything is a game.local cosmetic. The board is
// redrawn at most once a second and only when its text changed (the clock has its own small texture).
import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from "three"
import { MeshBasicNodeMaterial } from "three/webgpu"
import * as TSL from "three/tsl"
import type { IGame } from "@blombo/game-runtime"
import { t } from "@/text"
import { ZONES, tourneyAt } from "../../server/rules.ts"
import { store } from "../net"
import { nightFactor, serverNow } from "../sky"
import { clock, fishName } from "../ui/format"
import { cloneRoot } from "../assets/packs"
import { packMaterials } from "../assets/materials"
import { Billboards } from "./billboards"
import { Fireworks, type BurstKind } from "./fireworks"
import { mergeItems, type MergeItem } from "./merge"
import { quality } from "./quality"
import type { World, ZoneView } from "./zones"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L = TSL as any

/**
 * The board: a wide, low screen (canvas at 128 px per metre) so it sits low in a phone's view, under
 * the HUD's top band. Its bottom band is a decorative footer: the stage's trophy stands in front of it.
 */
const PX = 128
const CANVAS_W = 1280
const CANVAS_H = 560
const BOARD_W = CANVAS_W / PX
const BOARD_H = CANVAS_H / PX
/** Board centre in stage-local metres (the stage's front is +Z; the board stands behind its arch). */
const BOARD_Y = 5.1 + BOARD_H / 2
const BOARD_Z = -2.9
/** Header: the title on the left, the clock strip (its own small texture) in a slot on the right. */
const SLOT = { x: 676, y: 18, w: 572, h: 80 }
const CONTENT = 120
const FOOTER = 484
/** Beyond this many metres the show is not drawn or redrawn. */
const FAR = 170
const FONT = "Rubik, sans-serif"
const MEDALS = ["#ffc83a", "#d9e1ea", "#e8975a"]
const MEDAL_INK = ["#5a3500", "#38424e", "#4a2208"]
const PALETTE = [0xff3a5a, 0xffb000, 0x2ad0ff, 0x5aff4a, 0xb04aff, 0xff6a1a, 0xff4ad0, 0xfff2c0]
const GOLD = 0xffc83a

type Mode = "live" | "idle"

interface Row {
  name: string
  fish: string
  pct: number
  me: boolean
}

export class Stage {
  private view: ZoneView | null = null
  private root: Group | null = null
  private release: (() => void) | null = null
  private readonly disposables: { dispose(): void }[] = []
  /** Stage origin (world) and turn. */
  private readonly origin = new Vector3()
  private yaw = 0
  private board: { canvas: HTMLCanvasElement; texture: CanvasTexture; sig: string } | null = null
  private clockFace: { canvas: HTMLCanvasElement; texture: CanvasTexture; sig: string } | null = null
  private halos: Billboards | null = null
  private bulbHalos: { index: number; x: number; y: number; z: number; phase: number }[] = []
  private lanternHalos: { index: number; x: number; y: number; z: number }[] = []
  /** Halo sizes were left at rest (no upload needed until the stage animates again). */
  private halosAtRest = false
  private beams: Mesh[] = []
  private crown: Object3D | null = null
  private fireworks: Fireworks | null = null
  private readonly bulbs = { level: L.uniform(0.3), chase: L.uniform(0), phase: L.uniform(0) }
  private redrawTimer = 0
  private fontsReady = false
  /** Last seen live flag (null until the first tournament state arrives). */
  private wasLive: boolean | null = null
  private glow = 0

  constructor(
    private readonly game: IGame,
    private readonly world: World,
  ) {
    void document.fonts?.load(`900 64px ${FONT}`).then(() => {
      this.fontsReady = true
      this.redrawTimer = 0
      if (this.board) this.board.sig = ""
      if (this.clockFace) this.clockFace.sig = ""
    })
  }

  update(dt: number): void {
    const tour = store.tourney
    const startShow = tour && this.wasLive !== null && tour.live !== this.wasLive ? (tour.live ? "start" : "end") : null
    if (tour) this.wasLive = tour.live
    const view = this.world.zones.get(0) ?? null
    if (view !== this.view) {
      this.teardown()
      if (view) this.build(view)
    }
    if (!this.root) return
    const p = this.game.player.position
    const near = Math.hypot(p.x - this.origin.x, p.z - this.origin.z) < FAR
    this.root.visible = near
    if (startShow && near) this.show(startShow)
    this.fireworks?.update(dt)
    if (!near) return
    const live = this.mode() === "live"
    const now = performance.now() / 1000
    this.animate(dt, now, live)
    this.redrawTimer -= dt
    if (this.redrawTimer <= 0) {
      this.redrawTimer = 1
      this.redraw()
    }
  }

  dispose(): void {
    this.teardown()
  }

  // ───────────── state ─────────────
  private mode(): Mode {
    const tour = store.tourney
    if (tour) return tour.live ? "live" : "idle"
    return tourneyAt(serverNow()).phase === "live" ? "live" : "idle"
  }

  /** The clock line and its colour scheme. */
  private clockText(): { text: string; kind: "live" | "soon" | "next" | "final" } {
    const now = serverNow()
    const t0 = tourneyAt(now)
    if (this.mode() === "live") {
      const end = t0.phase === "live" ? t0.endsAt : (store.tourney?.endsAt ?? 0)
      const left = end - now
      return left > 500 ? { text: t("stage.ends", { time: clock(left) }), kind: "live" } : { text: t("stage.final"), kind: "final" }
    }
    const left = t0.startsAt - now
    return t0.phase === "soon" ? { text: t("stage.soon", { time: clock(left) }), kind: "soon" } : { text: t("stage.next", { time: clock(left) }), kind: "next" }
  }

  private rows(): Row[] {
    return (store.tourney?.board ?? []).slice(0, 3).map((e) => ({ name: e.n, fish: fishName(e.sp), pct: e.s, me: e.u === store.userId }))
  }

  private champion(): { name: string; fish: string; pct: number } | null {
    const crown = store.tourney?.crown ?? ""
    if (!crown) return null
    const entry = store.tourney?.board.find((e) => e.u === crown)
    const name = entry?.n ?? this.game.players.find((pl) => pl.userId === crown)?.name ?? ""
    return name ? { name, fish: entry ? fishName(entry.sp) : "", pct: entry?.s ?? 0 } : null
  }

  // ───────────── build / teardown ─────────────
  private build(view: ZoneView): void {
    this.view = view
    const c = ZONES[0]!
    const inst = view.data.instances.find((i) => i[0] === "tourney_stage")
    const anchor = view.data.anchors.stage as number[] | undefined
    if (inst) {
      this.origin.set(c.x + inst[1], inst[2], c.z + inst[3])
      this.yaw = inst[4]
    } else if (anchor && typeof anchor[0] === "number") {
      // the anchor is the stage's front edge, 2 m ahead of the prop
      this.yaw = anchor[3] ?? Math.PI / 2
      this.origin.set(c.x + anchor[0] - Math.sin(this.yaw) * 2, anchor[1] ?? 1, c.z + (anchor[2] ?? 0) - Math.cos(this.yaw) * 2)
    } else return
    const root = new Group()
    root.name = "stage-show"
    const local = new Group()
    local.position.copy(this.origin)
    local.rotation.y = this.yaw
    root.add(local)

    // the frame, posts and marquee bulbs (one mesh each)
    const parts: MergeItem[] = []
    const bulbs: MergeItem[] = []
    this.frame(parts, bulbs)
    const frame = mergeItems(parts)
    const bulbGeo = mergeItems(bulbs)
    // the pieces were only merge sources
    for (const item of [...parts, ...bulbs]) item.geometry.dispose()
    if (frame) {
      this.disposables.push(frame)
      local.add(new Mesh(frame, packMaterials().toonFlat))
    }
    if (bulbGeo) {
      const material = new MeshBasicNodeMaterial()
      // vertex alpha holds each bulb's place in the chase (0, 0.25, 0.5, 0.75)
      const vc = L.vertexColor()
      const chase = L.step(0.5, L.fract(vc.w.add(this.bulbs.phase)))
      const on = L.max(this.bulbs.level, chase.mul(this.bulbs.chase))
      material.colorNode = vc.xyz.mul(on.mul(1.15).add(0.32))
      this.disposables.push(bulbGeo, material)
      local.add(new Mesh(bulbGeo, material))
    }

    // the board and its clock strip
    const board = this.canvas(CANVAS_W, CANVAS_H)
    const boardMesh = this.plane(board.texture, BOARD_W, BOARD_H, false)
    boardMesh.position.set(0, BOARD_Y, BOARD_Z)
    local.add(boardMesh)
    this.board = { ...board, sig: "" }
    const face = this.canvas(SLOT.w, SLOT.h)
    const clockMesh = this.plane(face.texture, SLOT.w / PX, SLOT.h / PX, true)
    clockMesh.position.set((SLOT.x + SLOT.w / 2 - CANVAS_W / 2) / PX, BOARD_Y + BOARD_H / 2 - (SLOT.y + SLOT.h / 2) / PX, BOARD_Z + 0.03)
    clockMesh.renderOrder = 1
    local.add(clockMesh)
    this.clockFace = { ...face, sig: "" }

    // the champion's crown turning on top
    const crown = cloneRoot("crown")
    if (crown) {
      crown.scale.setScalar(4.2)
      crown.position.set(0, BOARD_Y + BOARD_H / 2 + 0.75, BOARD_Z)
      local.add(crown)
      this.crown = crown
    }

    // searchlights at the board's top corners (high quality, live only)
    const beamGeo = new CylinderGeometry(2.4, 0.22, 36, 14, 1, true)
    beamGeo.translate(0, 18, 0)
    const count = beamGeo.getAttribute("position").count
    const pos = beamGeo.getAttribute("position")
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const k = Math.max(0, 1 - pos.getY(i) / 36)
      colors.set([k, k, k], i * 3)
    }
    beamGeo.setAttribute("color", new Float32BufferAttribute(colors, 3))
    this.disposables.push(beamGeo)
    for (const [side, tint] of [[-1, 0xffe9b0], [1, 0xb8f0ff]] as const) {
      const material = new MeshBasicMaterial({ color: tint, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false })
      // additive light needs no back-to-front pass: one draw instead of two
      material.forceSinglePass = true
      this.disposables.push(material)
      const beam = new Mesh(beamGeo, material)
      beam.position.set(side * (BOARD_W / 2 + 0.25), BOARD_Y + BOARD_H / 2 + 0.2, BOARD_Z - 0.35)
      beam.rotation.order = "YXZ"
      beam.visible = false
      beam.renderOrder = 4
      local.add(beam)
      this.beams.push(beam)
    }

    // halos: the arch's paper lanterns and the marquee bulbs (world positions)
    const halos = new Billboards(96, "halo")
    this.disposables.push(halos)
    const w = new Vector3()
    for (let i = 0; i < 7; i++) {
      // the arch's paper lanterns (tourney_stage prop)
      this.toWorld(-2.7 + i * 0.9, 3.87, -1.7, w)
      this.lanternHalos.push({ index: halos.add(w.x, w.y, w.z, 2.2, [0xffd27a, 0xff9a5a, 0xff7eb6][i % 3]!), x: w.x, y: w.y, z: w.z })
    }
    this.bulbSpots((x, y, phase) => {
      this.toWorld(x, y, BOARD_Z + 0.3, w)
      const index = halos.add(w.x, w.y, w.z, 0.7, phase % 0.5 ? 0xffd890 : 0xfff2c8)
      this.bulbHalos.push({ index, x: w.x, y: w.y, z: w.z, phase })
    })
    root.add(halos.mesh)
    this.halos = halos

    const fireworks = new Fireworks(2048)
    this.disposables.push(fireworks)
    root.add(fireworks.mesh)
    this.fireworks = fireworks

    this.root = root
    this.redrawTimer = 0
    const disposables = this.disposables
    const textures = [board.texture, face.texture]
    this.release = this.game.local.add(root, () => {
      for (const d of disposables.splice(0)) d.dispose()
      for (const tx of textures) tx.dispose()
      ;(boardMesh.material as MeshBasicMaterial).dispose()
      ;(clockMesh.material as MeshBasicMaterial).dispose()
    })
  }

  private teardown(): void {
    this.release?.()
    this.release = null
    this.root = null
    this.view = null
    this.board = null
    this.clockFace = null
    this.halos = null
    this.bulbHalos = []
    this.lanternHalos = []
    this.halosAtRest = false
    this.beams = []
    this.crown = null
    this.fireworks = null
  }

  private toWorld(lx: number, ly: number, lz: number, out: Vector3): Vector3 {
    const c = Math.cos(this.yaw)
    const s = Math.sin(this.yaw)
    return out.set(this.origin.x + lx * c + lz * s, this.origin.y + ly, this.origin.z - lx * s + lz * c)
  }

  /** Calls back for every marquee bulb (stage-local x, y and its chase phase). */
  private bulbSpots(each: (x: number, y: number, phase: number) => void): void {
    const hw = BOARD_W / 2 + 0.17
    const hh = BOARD_H / 2 + 0.17
    const across = 19
    const up = 8
    let k = 0
    // clockwise around the frame so the chase runs around it
    for (let i = 0; i <= across; i++) each(-hw + (2 * hw * i) / across, BOARD_Y + hh, (k++ % 4) / 4)
    for (let i = 1; i < up; i++) each(hw, BOARD_Y + hh - (2 * hh * i) / up, (k++ % 4) / 4)
    for (let i = across; i >= 0; i--) each(-hw + (2 * hw * i) / across, BOARD_Y - hh, (k++ % 4) / 4)
    for (let i = up - 1; i >= 1; i--) each(-hw, BOARD_Y + hh - (2 * hh * i) / up, (k++ % 4) / 4)
  }

  /** The board's wooden frame, gold trim, crest and posts; and the bulbs on the frame. */
  private frame(parts: MergeItem[], bulbs: MergeItem[]): void {
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) => parts.push({ geometry: tinted(new BoxGeometry(w, h, d), color, 1), matrix: new Matrix4().makeTranslation(x, y, z) })
    const W = BOARD_W
    const H = BOARD_H
    const z = BOARD_Z
    // back panel, frame bars, a thin gold line inside the frame
    box(W + 0.6, H + 0.6, 0.22, 0, BOARD_Y, z - 0.18, 0x1b2c45)
    const bar = 0.34
    box(W + 2 * bar, bar, 0.42, 0, BOARD_Y + H / 2 + bar / 2, z - 0.04, 0xb8452f)
    box(W + 2 * bar, bar, 0.42, 0, BOARD_Y - H / 2 - bar / 2, z - 0.04, 0xb8452f)
    box(bar, H, 0.42, W / 2 + bar / 2, BOARD_Y, z - 0.04, 0xb8452f)
    box(bar, H, 0.42, -W / 2 - bar / 2, BOARD_Y, z - 0.04, 0xb8452f)
    box(W + 0.08, 0.06, 0.06, 0, BOARD_Y + H / 2 + 0.03, z + 0.02, GOLD)
    box(W + 0.08, 0.06, 0.06, 0, BOARD_Y - H / 2 - 0.03, z + 0.02, GOLD)
    box(0.06, H, 0.06, W / 2 + 0.03, BOARD_Y, z + 0.02, GOLD)
    box(0.06, H, 0.06, -W / 2 - 0.03, BOARD_Y, z + 0.02, GOLD)
    // crest under the crown, corner caps
    box(2.6, 0.5, 0.5, 0, BOARD_Y + H / 2 + bar + 0.22, z - 0.04, 0xb8452f)
    box(2.2, 0.12, 0.54, 0, BOARD_Y + H / 2 + bar + 0.5, z - 0.04, GOLD)
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) box(0.56, 0.56, 0.5, sx * (W / 2 + bar / 2), BOARD_Y + sy * (H / 2 + bar / 2), z - 0.04, GOLD)
    // lamp housings for the searchlights
    for (const sx of [-1, 1]) box(0.5, 0.36, 0.5, sx * (W / 2 + 0.25), BOARD_Y + H / 2 + 0.36, z - 0.35, 0x2a2a34)
    // posts and a cross brace, behind the stage
    const bottom = BOARD_Y - H / 2 - bar
    for (const sx of [-1, 1]) {
      box(0.4, bottom + 0.4, 0.4, sx * (W / 2 - 0.7), (bottom + 0.4) / 2 - 0.2, z - 0.45, 0x6b4226)
      box(0.6, 0.3, 0.6, sx * (W / 2 - 0.7), 0.15, z - 0.45, 0x4a2e1a)
    }
    box(W - 1.0, 0.24, 0.24, 0, bottom - 0.9, z - 0.45, 0x6b4226)
    // bulbs (vertex alpha = chase phase)
    const bulb = new IcosahedronGeometry(0.11, 0)
    this.bulbSpots((x, y, phase) => {
      bulbs.push({ geometry: tinted(bulb.clone(), phase % 0.5 ? 0xffd890 : 0xfff2c8, phase), matrix: new Matrix4().makeTranslation(x, y, z + 0.24) })
    })
    bulb.dispose()
  }

  private canvas(width: number, height: number): { canvas: HTMLCanvasElement; texture: CanvasTexture } {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
    return { canvas, texture }
  }

  private plane(texture: CanvasTexture, w: number, h: number, transparent: boolean): Mesh {
    const geometry = new PlaneGeometry(w, h)
    this.disposables.push(geometry)
    const material = new MeshBasicMaterial({ map: texture, transparent, fog: false })
    return new Mesh(geometry, material)
  }

  // ───────────── animation ─────────────
  private animate(dt: number, now: number, live: boolean): void {
    const night = nightFactor()
    const soon = !live && tourneyAt(serverNow()).phase === "soon"
    this.glow += ((live ? 1 : 0) - this.glow) * Math.min(1, dt * 2.5)
    const g = this.glow
    // bulbs: steady and dim between rounds, blinking in the last minute, chasing while live
    this.bulbs.phase.value = (now * 2.2) % 1
    this.bulbs.chase.value = g
    this.bulbs.level.value = soon ? (Math.sin(now * 6) > 0 ? 1 : 0.15) : 0.25 * (1 - g) + 0.35 * g
    const halos = this.halos
    const moving = g > 0.001 || soon
    if (halos && (moving || !this.halosAtRest)) {
      halos.intensity.value = 0.35 + night * 0.7 + g * (0.9 + night * 0.3)
      for (const b of this.bulbHalos) {
        const on = (b.phase + this.bulbs.phase.value) % 1 >= 0.5 ? 1 : 0
        const lit = Math.max(this.bulbs.level.value, on * g)
        halos.move(b.index, b.x, b.y, b.z, 0.25 + lit * 0.75)
      }
      this.lanternHalos.forEach((h, i) => halos.move(h.index, h.x, h.y, h.z, (1.2 + g * 1.6) * (1 + Math.sin(now * 3 + i) * 0.08 * g)))
      this.halosAtRest = !moving
    } else if (halos) halos.intensity.value = 0.35 + night * 0.7
    // searchlights sweep across the sky while live (high quality only)
    const beamsOn = g > 0.02 && quality.level === "high"
    this.beams.forEach((beam, i) => {
      beam.visible = beamsOn
      if (!beamsOn) return
      const side = i === 0 ? -1 : 1
      // lean outward (and a little back), swinging in toward each other now and then
      beam.rotation.z = -side * (0.25 + Math.sin(now * 0.55 + i * 2.1) * 0.5)
      beam.rotation.x = -0.18 + Math.sin(now * 0.4 + i) * 0.16
      ;(beam.material as MeshBasicMaterial).color.set(i === 0 ? 0xffe9b0 : 0xb8f0ff).multiplyScalar((0.18 + night * 0.32) * g)
    })
    if (this.crown) {
      this.crown.rotation.y = now * 0.8
      this.crown.position.y = BOARD_Y + BOARD_H / 2 + 0.75 + Math.sin(now * 1.6) * 0.08
    }
    if (this.fireworks) this.fireworks.intensity.value = 1 + night * 0.35
  }

  /** A firework show above the stage: a short opener when a round starts, a longer finale when it ends. */
  private show(kind: "start" | "end"): void {
    const fw = this.fireworks
    if (!fw) return
    fw.density = quality.level === "high" ? 1 : 0.5
    const n = kind === "end" ? 16 : 10
    const span = kind === "end" ? 5.2 : 3.2
    const from = new Vector3()
    const to = new Vector3()
    const pick = () => PALETTE[Math.floor(Math.random() * PALETTE.length)]!
    for (let i = 0; i < n; i++) {
      const finale = kind === "end" && i >= n - 3
      // the follow camera shows little sky over the board: most bursts open beside it, at its height
      const high = i % 4 === 3
      const side = i % 2 ? 1 : -1
      const x = finale ? (i - (n - 2)) * 8.5 : high ? (Math.random() * 2 - 1) * 3 : side * (7 + Math.random() * 4)
      const y = finale ? (i === n - 2 ? 12.5 : 10) : high ? 12 + Math.random() * 1.5 : 7 + Math.random() * 3.5
      const z = finale ? BOARD_Z - 2.5 : BOARD_Z - 2 - Math.random() * 4
      this.toWorld(x * 0.5, 0.3, z + 1.5, from)
      this.toWorld(x, y, z, to)
      const kinds: BurstKind[] = ["peony", "peony", "ring", "crackle", "willow"]
      const burst: BurstKind = finale ? "willow" : kinds[Math.floor(Math.random() * kinds.length)]!
      const colors = finale ? [GOLD, 0xffe9a0] : [pick(), pick()]
      fw.launch({ from: from.clone(), to: to.clone(), delay: finale ? span : (i / n) * span + Math.random() * 0.25, colors, kind: burst, power: finale ? 1.35 : 0.9 + Math.random() * 0.3 })
    }
  }

  // ───────────── drawing ─────────────
  private redraw(): void {
    const live = this.mode() === "live"
    const rows = this.rows()
    const champ = live ? null : this.champion()
    const ck = this.clockText()
    if (this.board) {
      const sig = JSON.stringify([live, rows, champ, this.fontsReady])
      if (sig !== this.board.sig) {
        this.board.sig = sig
        this.drawBoard(this.board.canvas, live, rows, champ)
        this.board.texture.needsUpdate = true
      }
    }
    if (this.clockFace) {
      const sig = ck.kind + "|" + ck.text + "|" + this.fontsReady
      if (sig !== this.clockFace.sig) {
        this.clockFace.sig = sig
        this.drawClock(this.clockFace.canvas, ck.text, ck.kind)
        this.clockFace.texture.needsUpdate = true
      }
    }
  }

  private drawClock(canvas: HTMLCanvasElement, text: string, kind: "live" | "soon" | "next" | "final"): void {
    const ctx = canvas.getContext("2d")!
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    const [top, bottom, ink] = kind === "live" || kind === "final" ? ["#ff7a5a", "#d8322a", "#ffffff"] : kind === "soon" ? ["#ffe27a", "#ff9a1a", "#3a2000"] : ["#5fe0d0", "#1f8f9a", "#ffffff"]
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, top)
    grad.addColorStop(1, bottom)
    roundRect(ctx, 4, 4, w - 8, h - 8, (h - 8) / 2)
    ctx.fillStyle = grad
    ctx.fill()
    ctx.lineWidth = 6
    ctx.strokeStyle = "#0b1a2a"
    ctx.stroke()
    let x0 = 40
    if (kind === "live" || kind === "final") {
      // a pulsing "on air" dot
      ctx.beginPath()
      ctx.arc(54, h / 2, 15, 0, Math.PI * 2)
      ctx.fillStyle = "#ffffff"
      ctx.fill()
      x0 = 78
    }
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    const label = fit(ctx, text, w - x0 - 40, 52, 30)
    ctx.lineJoin = "round"
    if (ink === "#ffffff") {
      ctx.lineWidth = 9
      ctx.strokeStyle = "#0b1a2a"
      ctx.strokeText(label, (x0 + w - 40) / 2, h / 2 + 3)
    }
    ctx.fillStyle = ink
    ctx.fillText(label, (x0 + w - 40) / 2, h / 2 + 3)
  }

  private drawBoard(canvas: HTMLCanvasElement, live: boolean, rows: Row[], champ: { name: string; fish: string; pct: number } | null): void {
    const ctx = canvas.getContext("2d")!
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.lineJoin = "round"
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, "#1d4a7a")
    bg.addColorStop(0.3, "#143258")
    bg.addColorStop(1, "#0b1d36")
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    // soft rays fanning out behind the title
    ctx.save()
    ctx.globalAlpha = 0.07
    ctx.fillStyle = "#ffffff"
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(330, 58)
      ctx.lineTo(330 + Math.cos(a) * 1400, 58 + Math.sin(a) * 1400)
      ctx.lineTo(330 + Math.cos(a + 0.11) * 1400, 58 + Math.sin(a + 0.11) * 1400)
      ctx.fill()
    }
    ctx.restore()
    // header: stars around the title on the left, the clock's slot on the right
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    const title = fit(ctx, t("stage.title"), SLOT.x - 170, 82, 48)
    const tw = ctx.measureText(title).width
    const tx = (SLOT.x - 10) / 2 + 10
    const tg = ctx.createLinearGradient(0, 22, 0, 92)
    tg.addColorStop(0, "#fff6c0")
    tg.addColorStop(1, "#ffb52e")
    ctx.lineWidth = 15
    ctx.strokeStyle = "#0b1a2a"
    ctx.strokeText(title, tx, 88)
    ctx.fillStyle = tg
    ctx.fillText(title, tx, 88)
    for (const side of [-1, 1]) star(ctx, tx + side * (tw / 2 + 44), 58, 26, "#ffc83a")
    roundRect(ctx, SLOT.x - 6, SLOT.y - 4, SLOT.w + 12, SLOT.h + 8, (SLOT.h + 8) / 2)
    ctx.fillStyle = "rgba(0, 10, 25, 0.55)"
    ctx.fill()
    footer(ctx, FOOTER)

    const x0 = 34
    const x1 = w - 34
    if (live) {
      if (!rows.length) this.drawEmpty(ctx, t("hud.tourney_empty"), t("stage.rule"))
      else for (let i = 0; i < 3; i++) this.drawRow(ctx, i, rows[i] ?? null, x0, CONTENT + i * 120, x1 - x0, 108, false)
      return
    }
    if (champ) {
      // the champion on the left, the last round's top 3 on the right
      const mid = Math.round(w * 0.47)
      this.drawChampion(ctx, champ, x0, CONTENT, mid - 14 - x0, FOOTER - 18 - CONTENT)
      if (rows.length) {
        ctx.textAlign = "left"
        ctx.font = `900 32px ${FONT}`
        ctx.fillStyle = "#9fc4e8"
        ctx.fillText(t("stage.last"), mid + 18, CONTENT + 30)
        for (let i = 0; i < 3; i++) this.drawRow(ctx, i, rows[i] ?? null, mid + 14, CONTENT + 46 + i * 104, x1 - mid - 14, 92, true)
      } else {
        ctx.textAlign = "center"
        ctx.fillStyle = "#9fe9ff"
        const line = fit(ctx, t("stage.win_next"), x1 - mid - 40, 48, 28)
        ctx.fillText(line, (mid + x1) / 2, (CONTENT + FOOTER) / 2 + 14)
      }
      return
    }
    if (rows.length) {
      ctx.textAlign = "left"
      ctx.font = `900 30px ${FONT}`
      ctx.fillStyle = "#9fc4e8"
      ctx.fillText(t("stage.last"), x0 + 8, CONTENT + 18)
      for (let i = 0; i < 3; i++) this.drawRow(ctx, i, rows[i] ?? null, x0, CONTENT + 30 + i * 112, x1 - x0, 100, false)
      return
    }
    this.drawEmpty(ctx, t("stage.no_champion"), t("stage.win_next"))
  }

  /** A trophy and two centred lines in the content area. */
  private drawEmpty(ctx: CanvasRenderingContext2D, line1: string, line2: string): void {
    const w = ctx.canvas.width
    trophy(ctx, w / 2, CONTENT + 84, 1.6)
    ctx.textAlign = "center"
    const a = fit(ctx, line1, w - 160, 66, 36)
    ctx.lineWidth = 12
    ctx.strokeStyle = "#0b1a2a"
    ctx.strokeText(a, w / 2, CONTENT + 230)
    ctx.fillStyle = "#ffffff"
    ctx.fillText(a, w / 2, CONTENT + 230)
    const b = fit(ctx, line2, w - 160, 44, 28)
    ctx.fillStyle = "#9fe9ff"
    ctx.fillText(b, w / 2, CONTENT + 296)
  }

  private drawChampion(ctx: CanvasRenderingContext2D, champ: { name: string; fish: string; pct: number }, x: number, y: number, w: number, h: number): void {
    roundRect(ctx, x, y, w, h, 34)
    const g = ctx.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, "rgba(255, 210, 80, 0.34)")
    g.addColorStop(1, "rgba(255, 160, 40, 0.12)")
    ctx.fillStyle = g
    ctx.fill()
    ctx.lineWidth = 5
    ctx.strokeStyle = "#ffc83a"
    ctx.stroke()
    const cx = x + w / 2
    crownIcon(ctx, cx - 72, y + 6, 2.25)
    ctx.textAlign = "center"
    ctx.font = `900 34px ${FONT}`
    ctx.fillStyle = "#ffd34d"
    ctx.fillText(t("stage.champion"), cx, y + 172)
    const name = fit(ctx, champ.name, w - 48, 64, 34)
    ctx.lineWidth = 12
    ctx.strokeStyle = "#0b1a2a"
    ctx.strokeText(name, cx, y + 236)
    ctx.fillStyle = "#ffffff"
    ctx.fillText(name, cx, y + 236)
    if (champ.fish) {
      const line = fit(ctx, champ.fish + " · " + t("hud.size_pct", { pct: champ.pct }), w - 48, 34, 24)
      ctx.fillStyle = "#9fe9ff"
      ctx.fillText(line, cx, y + 282)
    }
  }

  /** One leaderboard line; `compact` rows (the last round, beside the champion) keep name and fish on one line. */
  private drawRow(ctx: CanvasRenderingContext2D, i: number, row: Row | null, x: number, y: number, rw: number, h: number, compact: boolean): void {
    roundRect(ctx, x, y, rw, h, h * 0.28)
    ctx.fillStyle = row?.me ? "rgba(255, 207, 58, 0.26)" : row ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.03)"
    ctx.fill()
    if (row?.me) {
      ctx.lineWidth = 4
      ctx.strokeStyle = "#ffcf3a"
      ctx.stroke()
    }
    const r = h * 0.36
    const cx = x + 16 + r
    const cy = y + h / 2
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = row ? MEDALS[i]! : "rgba(255, 255, 255, 0.12)"
    ctx.fill()
    ctx.lineWidth = 5
    ctx.strokeStyle = "#0b1a2a"
    ctx.stroke()
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.font = `900 ${Math.round(r * 1.25)}px ${FONT}`
    ctx.fillStyle = row ? MEDAL_INK[i]! : "rgba(255, 255, 255, 0.35)"
    ctx.fillText(String(i + 1), cx, cy + r * 0.08)
    ctx.textBaseline = "alphabetic"
    if (!row) {
      ctx.textAlign = "left"
      ctx.font = `900 ${compact ? 36 : 44}px ${FONT}`
      ctx.fillStyle = "rgba(255, 255, 255, 0.28)"
      ctx.fillText("· · ·", cx + r + 26, cy + 14)
      return
    }
    // size on the right, then the name (and fish) in what is left
    ctx.textAlign = "right"
    const pct = t("hud.size_pct", { pct: row.pct })
    const pctSize = compact ? 50 : 70
    ctx.font = `900 ${pctSize}px ${FONT}`
    ctx.lineWidth = compact ? 9 : 12
    ctx.strokeStyle = "#0b1a2a"
    ctx.strokeText(pct, x + rw - 24, cy + pctSize * 0.36)
    ctx.fillStyle = MEDALS[i]!
    ctx.fillText(pct, x + rw - 24, cy + pctSize * 0.36)
    const pctW = ctx.measureText(pct).width
    const left = cx + r + 22
    const room = x + rw - 24 - pctW - 28 - left
    ctx.textAlign = "left"
    const nameSize = compact ? 40 : 52
    const name = fit(ctx, row.name, room, nameSize, 28)
    ctx.lineWidth = compact ? 9 : 10
    ctx.strokeStyle = "#0b1a2a"
    const nameY = compact ? y + h * 0.5 : y + h * 0.48
    ctx.strokeText(name, left, nameY)
    ctx.fillStyle = row.me ? "#ffe27a" : "#ffffff"
    ctx.fillText(name, left, nameY)
    const nameW = ctx.measureText(name).width
    if (row.me) {
      // a "You" tag after the name when it fits
      ctx.font = `900 30px ${FONT}`
      const you = t("hud.tourney_you")
      const yw = ctx.measureText(you).width + 28
      if (nameW + 14 + yw <= room) {
        roundRect(ctx, left + nameW + 14, nameY - 34, yw, 40, 20)
        ctx.fillStyle = "#ffcf3a"
        ctx.fill()
        ctx.fillStyle = "#3a2000"
        ctx.fillText(you, left + nameW + 28, nameY - 3)
      }
    }
    const fish = fit(ctx, row.fish, room, compact ? 30 : 36, 22)
    ctx.fillStyle = "#9fe9ff"
    ctx.fillText(fish, left, compact ? y + h * 0.86 : y + h * 0.85)
  }
}

/** Every corner one colour; `alpha` goes into the vertex alpha (the bulbs' chase phase). */
function tinted(geometry: BufferGeometry, color: number, alpha: number): BufferGeometry {
  const n = geometry.getAttribute("position").count
  const data = new Float32Array(n * 4)
  const r = ((color >> 16) & 255) / 255
  const g = ((color >> 8) & 255) / 255
  const b = (color & 255) / 255
  for (let i = 0; i < n; i++) data.set([r, g, b, alpha], i * 4)
  geometry.setAttribute("color", new Float32BufferAttribute(data, 4))
  return geometry
}

/** Sets the font to the largest size (down to `min`) that fits, then shortens the text if it still does not. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number, size: number, min: number): string {
  let s = size
  ctx.font = `900 ${s}px ${FONT}`
  while (s > min && ctx.measureText(text).width > max) {
    s -= 2
    ctx.font = `900 ${s}px ${FONT}`
  }
  if (ctx.measureText(text).width <= max) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(cut + "…").width > max) cut = cut.slice(0, -1)
  return cut + "…"
}

/** The board's bottom band: a row of little fish swimming between stars. */
function footer(ctx: CanvasRenderingContext2D, y: number): void {
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  ctx.fillStyle = "rgba(0, 8, 20, 0.35)"
  ctx.fillRect(0, y, w, h - y)
  ctx.fillStyle = "#ffc83a"
  ctx.fillRect(0, y, w, 4)
  const cy = y + (h - y) / 2 + 2
  const colors = ["#ff9a5a", "#5fd8ff", "#ffc83a", "#8aff7a", "#ff7eb6", "#c07aff"]
  for (let i = 0; i < 9; i++) {
    const x = 70 + i * ((w - 140) / 8)
    if (i % 2) {
      star(ctx, x, cy, 13, "#ffe27a")
      continue
    }
    ctx.save()
    ctx.translate(x, cy)
    if (i % 4 === 2) ctx.scale(-1, 1)
    ctx.beginPath()
    ctx.ellipse(0, 0, 26, 15, 0, 0, Math.PI * 2)
    ctx.moveTo(20, 0)
    ctx.lineTo(42, -14)
    ctx.lineTo(42, 14)
    ctx.closePath()
    ctx.fillStyle = colors[(i / 2) % colors.length]!
    ctx.fill()
    ctx.lineWidth = 5
    ctx.strokeStyle = "#0b1a2a"
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(-12, -3, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = "#0b1a2a"
    ctx.fill()
    ctx.restore()
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.arcTo(x + w, y, x + w, y + h, k)
  ctx.arcTo(x + w, y + h, x, y + h, k)
  ctx.arcTo(x, y + h, x, y, k)
  ctx.arcTo(x, y, x + w, y, k)
  ctx.closePath()
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = "#0b1a2a"
  ctx.stroke()
}

/** The HUD's crown icon (64-unit art) at (x, y) top-left, scaled. */
function crownIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.beginPath()
  ctx.moveTo(8, 22)
  ctx.lineTo(20, 34)
  ctx.lineTo(32, 14)
  ctx.lineTo(44, 34)
  ctx.lineTo(56, 22)
  ctx.lineTo(50, 50)
  ctx.lineTo(14, 50)
  ctx.closePath()
  ctx.fillStyle = "#ffc83a"
  ctx.fill()
  ctx.lineWidth = 4
  ctx.lineJoin = "round"
  ctx.strokeStyle = "#7a4a00"
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(32, 38, 4, 0, Math.PI * 2)
  ctx.fillStyle = "#e8463a"
  ctx.fill()
  for (const [cx, cy] of [[8, 22], [32, 14], [56, 22]] as const) {
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.fillStyle = "#fff3a0"
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

/** The HUD's trophy icon centred at (x, y). */
function trophy(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save()
  ctx.translate(x - 32 * s * 1.6, y - 32 * s * 1.6)
  ctx.scale(s * 1.6, s * 1.6)
  ctx.lineWidth = 4
  ctx.lineJoin = "round"
  ctx.strokeStyle = "#7a4a00"
  ctx.beginPath()
  ctx.moveTo(18, 8)
  ctx.lineTo(46, 8)
  ctx.lineTo(46, 22)
  ctx.arc(32, 22, 14, 0, Math.PI)
  ctx.closePath()
  ctx.fillStyle = "#ffc83a"
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(18, 14)
  ctx.lineTo(8, 14)
  ctx.bezierCurveTo(8, 24, 14, 28, 20, 28)
  ctx.moveTo(46, 14)
  ctx.lineTo(56, 14)
  ctx.bezierCurveTo(56, 24, 50, 28, 44, 28)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(28, 36)
  ctx.lineTo(36, 36)
  ctx.lineTo(36, 44)
  ctx.lineTo(42, 44)
  ctx.lineTo(42, 54)
  ctx.lineTo(22, 54)
  ctx.lineTo(22, 44)
  ctx.lineTo(28, 44)
  ctx.closePath()
  ctx.fillStyle = "#e8a83a"
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}
