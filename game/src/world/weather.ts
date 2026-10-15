// Weather the player can see. The server decides the sky (src/sky.ts) and sets fog and light; this
// draws what falls and glows: rain streaks (snow on Frost Lake), rings where rain hits the water,
// storms with gusting wind and lightning, and aurora curtains in the northern night sky.
// Every effect follows the camera, is one draw call (zero when off), and fades in and out over ~2 s.
// Low quality halves the particles and skips the ripples, the lightning bolt and two aurora curtains.
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
  type Matrix4,
  type Object3D,
} from "three"
import { MeshBasicNodeMaterial } from "three/webgpu"
import * as TSL from "three/tsl"
import { ZONES, zoneAt } from "../../server/rules.ts"
import { currentSky, nightFactor, serverNow } from "../sky"
import { quality } from "./quality"

// Shader graphs are built with TSL's untyped chain API (its generics cannot follow node arithmetic).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L = TSL as any

/** What the weather needs from the game. */
export interface WeatherHost {
  camera: { matrixWorld: Matrix4; getWorldDirection(target: Vector3): Vector3 }
  player: { position: { x: number; z: number } }
  local: { add(object: Object3D, cleanup: () => void): () => void }
}

/** Seconds for an effect to fade fully in or out. */
const FADE_S = 2
const FROST = ZONES.findIndex((z) => z.key === "frost")
/** The water surface (splash rings sit here too). */
const WATER_Y = 0.07
const RAIN_CAP = 2600
const SNOW_CAP = 1800
const RIPPLE_CAP = 150
/** How hard it falls: drizzle-ish rain, full storm. */
const PRECIP: Record<string, number> = { rain: 0.6, storm: 1 }

interface Uniform<T> {
  value: T
}
const uniform = <T>(value: T): Uniform<T> => L.uniform(value)

function approach(current: number, target: number, dt: number): number {
  const step = dt / FADE_S
  return current + Math.max(-step, Math.min(step, target - current))
}

/** Per-instance random seeds: xyz in [0, 1), w a speed factor of 0.8..1.2 in 0.1 steps (see Precip.drift). */
function seeds(count: number, w: (i: number) => number): InstancedBufferAttribute {
  const data = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) data.set([Math.random(), Math.random(), Math.random(), w(i)], i * 4)
  return new InstancedBufferAttribute(data, 4)
}

/** Places a world-anchored point inside a box that travels with the camera (wrapping on each axis). */
function wrapInBox(point: any, origin: any, size: any): { p: any; e: any } {
  const rel = point.sub(origin)
  const wrapped = rel.sub(size.mul(L.floor(rel.div(size))))
  // e: 0 at the box centre, 1 at its faces (used to fade drops before they wrap)
  return { p: origin.add(wrapped), e: wrapped.div(size).sub(0.5).abs().mul(2) }
}

/** Falling rain streaks or snowflakes: instanced quads in one draw, moved entirely on the GPU. */
class Precip {
  readonly mesh: Mesh
  readonly amount = uniform(0)
  readonly light = uniform(1)
  /** Box min corner (world). */
  readonly origin = uniform(new Vector3())
  /** Accumulated fall displacement, so a change of wind never makes drops jump. */
  readonly drift = uniform(new Vector3())
  /** Unit falling direction and streak length (rain). */
  readonly dir = uniform(new Vector3(0, -1, 0))
  readonly len = uniform(0.8)
  private readonly geometry: InstancedBufferGeometry
  private readonly material: MeshBasicNodeMaterial

  constructor(
    readonly kind: "rain" | "snow",
    readonly capacity: number,
    readonly box: Vector3,
  ) {
    const plane = new PlaneGeometry(1, 1)
    const geometry = new InstancedBufferGeometry()
    geometry.index = plane.index
    geometry.setAttribute("position", plane.getAttribute("position"))
    geometry.setAttribute("uv", plane.getAttribute("uv"))
    const seed = seeds(capacity, () => 0.8 + 0.1 * Math.floor(Math.random() * 5))
    geometry.setAttribute("aSeed", seed)
    geometry.instanceCount = 0
    this.geometry = geometry

    const s = L.instancedBufferAttribute(seed)
    const size = L.vec3(box.x, box.y, box.z)
    const start = s.xyz.mul(size).add(this.drift.mul(s.w))
    const { p, e } = wrapInBox(start, this.origin, size)
    const local = L.positionLocal
    const t = L.time
    // fade near the box faces, right in front of the lens, and below the water
    const edge = L.float(1).sub(L.smoothstep(0.72, 1.0, L.max(e.x, e.z))).mul(L.float(1).sub(L.smoothstep(0.7, 1.0, e.y)))
    let center = p
    if (kind === "snow") center = p.add(L.vec3(L.sin(t.mul(1.3).add(s.x.mul(40))).mul(0.35), 0, L.cos(t.mul(1.1).add(s.z.mul(40))).mul(0.35)))
    const near = L.smoothstep(kind === "rain" ? 1.6 : 1.0, kind === "rain" ? 4.0 : 2.5, L.length(center.sub(L.cameraPosition)))
    const fade = L.varying(edge.mul(near).mul(L.step(WATER_Y, center.y)))
    const material = new MeshBasicNodeMaterial()
    if (kind === "rain") {
      // a thin streak from the drop back along its motion, turned to face the camera
      const side = L.normalize(L.cross(this.dir, L.cameraPosition.sub(p)).add(L.vec3(0.0001, 0, 0)))
      const world = p.add(side.mul(local.x.mul(0.035))).sub(this.dir.mul(local.y.add(0.5).mul(this.len).mul(s.w)))
      material.vertexNode = L.cameraProjectionMatrix.mul(L.cameraViewMatrix.mul(L.vec4(world, 1)))
      const uv = L.uv()
      const across = L.float(1).sub(uv.x.mul(2).sub(1).abs())
      const along = L.float(1).sub(uv.y.mul(0.8))
      material.colorNode = L.vec3(0.8, 0.88, 0.98).mul(this.light)
      material.opacityNode = across.mul(along).mul(fade).mul(this.amount).mul(0.62)
    } else {
      // a soft round flake facing the camera
      const view = L.cameraViewMatrix.mul(L.vec4(center, 1))
      const r = s.w.mul(0.1)
      material.vertexNode = L.cameraProjectionMatrix.mul(L.vec4(view.xyz.add(L.vec3(local.x.mul(r), local.y.mul(r), 0)), 1))
      const d = L.length(L.uv().sub(L.vec2(0.5, 0.5))).mul(2)
      material.colorNode = L.vec3(0.96, 0.98, 1).mul(this.light)
      material.opacityNode = L.float(1).sub(L.smoothstep(0.3, 1.0, d)).mul(fade).mul(this.amount).mul(0.92)
    }
    material.transparent = true
    material.depthWrite = false
    material.fog = false
    material.name = "weather_" + kind
    this.material = material
    this.mesh = new Mesh(geometry, material)
    this.mesh.name = "weather_" + kind
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 4
    this.mesh.visible = false
  }

  /** Moves the box to the camera and advances the fall by velocity × dt. */
  step(center: Vector3, velocity: Vector3, dt: number, level: number, cap: number): void {
    const count = Math.round(cap * level)
    this.geometry.instanceCount = count
    this.mesh.visible = count > 0
    if (!this.mesh.visible) return
    this.origin.value.copy(center).addScaledVector(this.box, -0.5)
    const d = this.drift.value.addScaledVector(velocity, dt)
    // Keep the accumulator small: shifting by 10 box sizes moves every drop (speed factor k/10) by a
    // whole number of boxes, which the wrap hides.
    d.x %= this.box.x * 10
    d.y %= this.box.y * 10
    d.z %= this.box.z * 10
    this.dir.value.copy(velocity).normalize()
    this.len.value = velocity.length() * 0.055
    this.amount.value = Math.min(1, level * 2.5)
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}

/** Rings opening where raindrops hit the water; land hides them (the ground is above the water). */
class Ripples {
  readonly mesh: Mesh
  readonly amount = uniform(0)
  readonly light = uniform(1)
  readonly origin = uniform(new Vector2())
  private readonly geometry: InstancedBufferGeometry
  private readonly material: MeshBasicNodeMaterial
  readonly size = 22

  constructor(readonly capacity: number) {
    const plane = new PlaneGeometry(1, 1)
    const geometry = new InstancedBufferGeometry()
    geometry.index = plane.index
    geometry.setAttribute("position", plane.getAttribute("position"))
    geometry.setAttribute("uv", plane.getAttribute("uv"))
    // x, z: base spot; y: cycles per second; w: instance id (whole number, seeds the hash)
    const seed = seeds(capacity, (i) => i)
    for (let i = 0; i < capacity; i++) seed.setY(i, 0.9 + Math.random() * 0.8)
    geometry.setAttribute("aSeed", seed)
    geometry.instanceCount = 0
    this.geometry = geometry

    const s = L.instancedBufferAttribute(seed)
    const cycle = L.time.mul(s.y).add(s.x.mul(7))
    const k = L.floor(cycle)
    const f = L.fract(cycle)
    // each cycle drops the ring somewhere new (world-anchored for its short life)
    const key = k.add(s.w.mul(4096))
    const jump = L.vec2(L.hash(key), L.hash(key.add(1_000_000)))
    const size = L.vec2(this.size, this.size)
    const start = L.vec2(s.x, s.z).add(jump).mul(size)
    const { p, e } = wrapInBox(start, this.origin, size)
    const r = f.mul(0.45).add(0.06)
    const local = L.positionLocal
    const world = L.vec3(p.x.add(local.x.mul(r).mul(2)), WATER_Y, p.y.sub(local.y.mul(r).mul(2)))
    const material = new MeshBasicNodeMaterial()
    material.vertexNode = L.cameraProjectionMatrix.mul(L.cameraViewMatrix.mul(L.vec4(world, 1)))
    const life = L.varying(L.float(1).sub(f).mul(L.float(1).sub(L.smoothstep(0.7, 1.0, L.max(e.x, e.y)))))
    const d = L.length(L.uv().sub(L.vec2(0.5, 0.5))).mul(2)
    const ring = L.smoothstep(0.6, 0.8, d).mul(L.float(1).sub(L.smoothstep(0.84, 1.0, d)))
    material.colorNode = L.vec3(0.9, 0.96, 1).mul(this.light)
    material.opacityNode = ring.mul(life).mul(life).mul(this.amount).mul(0.7)
    material.transparent = true
    material.depthWrite = false
    material.side = DoubleSide
    material.fog = false
    material.name = "weather_ripples"
    this.material = material
    this.mesh = new Mesh(geometry, material)
    this.mesh.name = "weather_ripples"
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.visible = false
  }

  step(center: Vector3, level: number): void {
    const count = Math.round(this.capacity * level)
    this.geometry.instanceCount = count
    this.mesh.visible = count > 0
    this.origin.value.set(center.x - this.size / 2, center.z - this.size / 2)
    this.amount.value = Math.min(1, level * 2)
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}

/** Curtain layout: arc from..to (radians from north, east positive), radius, base height, height, seed, gain. */
const CURTAINS: [number, number, number, number, number, number, number][] = [
  [-1.25, 0.05, 116, 13, 44, 0.13, 1],
  [-0.55, 0.75, 126, 18, 48, 0.57, 0.9],
  [0.35, 1.45, 112, 11, 40, 0.91, 0.85],
  // high quality extras
  [-0.95, 0.25, 104, 24, 34, 0.33, 0.6],
  [1.15, 2.0, 120, 14, 38, 0.71, 0.55],
]
const CURTAINS_LOW = 3
const CURTAIN_SEGMENTS = 40

/** Aurora: large waving ribbons low over the northern horizon, drawn in one additive mesh. */
class Aurora {
  readonly mesh: Mesh
  readonly amount = uniform(0)
  private readonly geometry = new BufferGeometry()
  private readonly material = new MeshBasicNodeMaterial()
  private readonly lowCount: number
  private readonly highCount: number

  constructor() {
    const pos: number[] = []
    const curt: number[] = []
    const uvs: number[] = []
    const index: number[] = []
    let base = 0
    for (const [from, to, radius, y0, height, seed, gain] of CURTAINS) {
      for (let i = 0; i <= CURTAIN_SEGMENTS; i++) {
        const u = i / CURTAIN_SEGMENTS
        const theta = from + (to - from) * u
        for (const v of [0, 1]) {
          // position holds (angle, height 0..1, gain); the shader builds the real shape
          pos.push(theta, v, gain)
          curt.push(radius, y0, height, seed)
          uvs.push(u, v)
        }
        if (i < CURTAIN_SEGMENTS) {
          const a = base + i * 2
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
        }
      }
      base += (CURTAIN_SEGMENTS + 1) * 2
    }
    const perCurtain = CURTAIN_SEGMENTS * 6
    this.lowCount = perCurtain * CURTAINS_LOW
    this.highCount = perCurtain * CURTAINS.length
    this.geometry.setAttribute("position", new Float32BufferAttribute(pos, 3))
    this.geometry.setAttribute("aCurtain", new Float32BufferAttribute(curt, 4))
    this.geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2))
    this.geometry.setIndex(index)

    const g = L.positionGeometry
    const c = L.attribute("aCurtain", "vec4")
    const theta = g.x
    const v = g.y
    const seed = c.w
    const t = L.time
    // the curtain folds and sways; its foot and top edge ripple slowly
    const fold = L.sin(theta.mul(5).add(t.mul(0.21)).add(seed.mul(7))).mul(4).add(L.sin(theta.mul(11).sub(t.mul(0.37)).add(seed.mul(3))).mul(1.6))
    const r = c.x.add(fold)
    const foot = L.sin(theta.mul(4).add(t.mul(0.17)).add(seed.mul(5))).mul(3)
    const top = c.z.mul(L.sin(theta.mul(3).sub(t.mul(0.13)).add(seed.mul(9))).mul(0.2).add(0.8))
    const y = c.y.add(foot).add(v.mul(top))
    this.material.positionNode = L.vec3(L.sin(theta).mul(r), y, L.cos(theta).mul(r).negate())

    // fragment: vertical rays drifting along the curtain, a bright foot, a violet fringe on top
    const th = L.varying(theta)
    const gain = L.varying(g.z)
    const sd = L.varying(seed)
    const uv = L.uv()
    const vv = uv.y
    const ray1 = L.sin(th.mul(47).add(t.mul(0.5)).add(L.sin(th.mul(9).add(t.mul(0.3))).mul(2))).mul(0.5).add(0.5)
    const ray2 = L.sin(th.mul(97).sub(t.mul(0.8)).add(sd.mul(13))).mul(0.5).add(0.5)
    const rays = ray1.mul(ray1).mul(0.6).add(L.pow(ray2, 4).mul(0.4))
    const travel = L.sin(th.mul(2).sub(t.mul(0.25)).add(sd.mul(6))).mul(0.35).add(0.65)
    const footEdge = L.smoothstep(0.0, 0.07, vv)
    const fadeTop = L.pow(L.float(1).sub(L.smoothstep(0.2, 1.0, vv)), 1.3)
    const ends = L.smoothstep(0.0, 0.14, uv.x).mul(L.smoothstep(1.0, 0.86, uv.x))
    const band = L.float(1).add(L.float(1).sub(L.smoothstep(0.02, 0.22, vv)).mul(0.9))
    const mint = L.vec3(0.55, 1.0, 0.72)
    const green = L.vec3(0.12, 0.95, 0.5)
    const teal = L.vec3(0.1, 0.72, 0.9)
    const violet = L.vec3(0.62, 0.32, 1.0)
    let col = L.mix(mint, green, L.smoothstep(0.0, 0.25, vv))
    col = L.mix(col, teal, L.smoothstep(0.3, 0.62, vv))
    col = L.mix(col, violet, L.smoothstep(0.55, 0.95, vv))
    // a slow violet drift along the arc
    col = L.mix(col, violet, L.sin(th.mul(1.5).add(t.mul(0.07)).add(sd.mul(4))).mul(0.5).add(0.5).mul(0.22))
    const glow = rays.mul(0.7).add(0.3).mul(footEdge).mul(fadeTop).mul(ends).mul(band).mul(travel).mul(gain)
    this.material.colorNode = col.mul(glow).mul(this.amount).mul(1.05)
    this.material.transparent = true
    this.material.depthWrite = false
    this.material.blending = AdditiveBlending
    this.material.side = DoubleSide
    this.material.fog = false
    this.material.name = "weather_aurora"
    this.mesh = new Mesh(this.geometry, this.material)
    this.mesh.name = "weather_aurora"
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1
    this.mesh.visible = false
  }

  step(camera: Vector3, level: number, low: boolean): void {
    this.mesh.visible = level > 0.001
    this.mesh.position.set(camera.x, 0, camera.z)
    this.amount.value = level * level * (3 - 2 * level)
    this.geometry.setDrawRange(0, low ? this.lowCount : this.highCount)
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}

const BOLT_SEGMENTS = 44

/** Storm lightning: a sky flash toward the strike, a short soft screen pulse and a jagged far bolt. */
class Lightning {
  readonly sky: Mesh
  readonly pulse: Mesh
  readonly bolt: Mesh
  /** 0..1 brightness of the current flash. */
  flash = 0
  private readonly skyFlash = uniform(0)
  private readonly pulseFlash = uniform(0)
  private readonly boltFlash = uniform(0)
  private readonly towards = uniform(new Vector2(0, -1))
  private readonly boltPos = new Float32Array(BOLT_SEGMENTS * 6 * 3)
  private readonly boltUv = new Float32Array(BOLT_SEGMENTS * 6 * 2)
  private readonly geos: BufferGeometry[] = []
  private readonly mats: MeshBasicNodeMaterial[] = []
  /** Seconds since the last strike (large = none) and until the next. */
  private since = 99
  private wait = 2.5

  constructor() {
    // sky: a dome around the camera, brightest low in the strike's direction
    const dome = new SphereGeometry(140, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.6)
    const skyMat = new MeshBasicNodeMaterial()
    const dir = L.normalize(L.positionLocal)
    const flat = L.normalize(L.vec2(dir.x, dir.z).add(L.vec2(0.0001, 0)))
    const toward = L.pow(L.max(L.dot(flat, this.towards), 0), 3)
    const low = L.float(1).sub(L.max(dir.y, 0).mul(0.6))
    skyMat.colorNode = L.vec3(0.72, 0.8, 1).mul(toward.mul(0.6).add(0.14)).mul(low).mul(this.skyFlash)
    skyMat.side = BackSide
    this.sky = this.flashMesh(dome, skyMat, "weather_flash_sky", -2)

    // pulse: a full-screen quad, faint
    const quad = new PlaneGeometry(2, 2)
    const pulseMat = new MeshBasicNodeMaterial()
    pulseMat.vertexNode = L.vec4(L.positionLocal.x, L.positionLocal.y, 0.5, 1)
    pulseMat.colorNode = L.vec3(0.85, 0.9, 1).mul(this.pulseFlash)
    pulseMat.depthTest = false
    this.pulse = this.flashMesh(quad, pulseMat, "weather_flash_pulse", 1000)

    // bolt: camera-facing ribbons, a hot core inside a soft glow
    const boltGeo = new BufferGeometry()
    boltGeo.setAttribute("position", new Float32BufferAttribute(this.boltPos, 3))
    boltGeo.setAttribute("uv", new Float32BufferAttribute(this.boltUv, 2))
    boltGeo.setDrawRange(0, 0)
    const boltMat = new MeshBasicNodeMaterial()
    const across = L.float(1).sub(L.uv().x.mul(2).sub(1).abs())
    const core = L.smoothstep(0.72, 0.92, across)
    boltMat.colorNode = L.vec3(0.82, 0.88, 1).mul(core.mul(1.6).add(L.pow(across, 3).mul(0.55))).mul(this.boltFlash)
    boltMat.side = DoubleSide
    this.bolt = this.flashMesh(boltGeo, boltMat, "weather_bolt", -1)
  }

  private flashMesh(geometry: BufferGeometry, material: MeshBasicNodeMaterial, name: string, order: number): Mesh {
    material.transparent = true
    material.depthWrite = false
    material.blending = AdditiveBlending
    material.fog = false
    material.name = name
    this.geos.push(geometry)
    this.mats.push(material)
    const mesh = new Mesh(geometry, material)
    mesh.name = name
    mesh.frustumCulled = false
    mesh.renderOrder = order
    mesh.visible = false
    return mesh
  }

  /** storm: 0..1; camera position and horizontal forward. */
  step(dt: number, storm: number, camera: Vector3, forward: Vector3, low: boolean): void {
    this.since += dt
    if (storm > 0.6) {
      this.wait -= dt
      if (this.wait <= 0) {
        this.strike(camera, forward, low)
        this.wait = 6 + Math.random() * 10
      }
    } else this.wait = 1.5 + Math.random() * 2.5
    // two quick flickers, then a fade
    const s = this.since
    const env = s < 0.07 ? 1 : s < 0.13 ? 0.3 : s < 0.22 ? 0.85 : Math.max(0, 0.85 * (1 - (s - 0.22) / 0.5))
    this.flash = env
    this.skyFlash.value = env
    this.pulseFlash.value = env * 0.16
    this.boltFlash.value = s < 0.34 ? env : 0
    this.sky.visible = env > 0.002
    this.pulse.visible = env > 0.002
    this.bolt.visible = !low && s < 0.34
    this.sky.position.copy(camera)
  }

  private strike(camera: Vector3, forward: Vector3, low: boolean): void {
    this.since = 0
    // somewhere ahead of the camera, so the player sees it
    const a = Math.atan2(forward.x, -forward.z) + (Math.random() - 0.5) * 1.3
    const dx = Math.sin(a)
    const dz = -Math.cos(a)
    this.towards.value.set(dx, dz)
    if (low) return
    const dist = 95 + Math.random() * 25
    const tx = dz
    const tz = -dx
    let seg = 0
    const pos = this.boltPos
    const uv = this.boltUv
    const ribbon = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, width: number) => {
      if (seg >= BOLT_SEGMENTS) return
      // side vector: perpendicular to the segment and to the view
      const ex = bx - ax
      const ey = by - ay
      const ez = bz - az
      const vx = ax - camera.x
      const vy = ay - camera.y
      const vz = az - camera.z
      let cx = ey * vz - ez * vy
      let cy = ez * vx - ex * vz
      let cz = ex * vy - ey * vx
      const n = Math.hypot(cx, cy, cz) || 1
      cx = (cx / n) * width * 0.5
      cy = (cy / n) * width * 0.5
      cz = (cz / n) * width * 0.5
      const quad = [
        [ax - cx, ay - cy, az - cz, 0],
        [ax + cx, ay + cy, az + cz, 1],
        [bx - cx, by - cy, bz - cz, 0],
        [ax + cx, ay + cy, az + cz, 1],
        [bx + cx, by + cy, bz + cz, 1],
        [bx - cx, by - cy, bz - cz, 0],
      ]
      for (let k = 0; k < 6; k++) {
        const q = quad[k]!
        const o = (seg * 6 + k) * 3
        pos[o] = q[0]!
        pos[o + 1] = q[1]!
        pos[o + 2] = q[2]!
        uv[(seg * 6 + k) * 2] = q[3]!
        uv[(seg * 6 + k) * 2 + 1] = 0
      }
      seg++
    }
    const path = (x: number, y: number, z: number, steps: number, drop: number, lean: number, width: number) => {
      const points: [number, number, number][] = [[x, y, z]]
      for (let i = 0; i < steps; i++) {
        const side = (Math.random() - 0.5) * 7 + lean
        const out = (Math.random() - 0.5) * 3
        x += tx * side + dx * out
        z += tz * side + dz * out
        y -= drop * (0.6 + Math.random() * 0.8)
        points.push([x, Math.max(-1, y), z])
      }
      for (let i = 0; i < points.length - 1; i++) {
        const p = points[i]!
        const q = points[i + 1]!
        ribbon(p[0], p[1], p[2], q[0], q[1], q[2], width)
      }
      return points
    }
    const sx = camera.x + dx * dist
    const sz = camera.z + dz * dist
    const main = path(sx, 72, sz, 16, 4.6, 0, 3.2)
    for (let b = 0; b < 3; b++) {
      const from = main[3 + Math.floor(Math.random() * 8)]
      if (from) path(from[0], from[1], from[2], 5 + Math.floor(Math.random() * 4), 3.2, (Math.random() < 0.5 ? -1 : 1) * 2.5, 1.8)
    }
    const geometry = this.bolt.geometry
    geometry.setDrawRange(0, seg * 6)
    geometry.getAttribute("position").needsUpdate = true
    geometry.getAttribute("uv").needsUpdate = true
  }

  dispose(): void {
    for (const g of this.geos) g.dispose()
    for (const m of this.mats) m.dispose()
  }
}

export class Weather {
  readonly root = new Group()
  private readonly rain = new Precip("rain", RAIN_CAP, new Vector3(30, 16, 30))
  private readonly snow = new Precip("snow", SNOW_CAP, new Vector3(26, 13, 26))
  private readonly ripples = new Ripples(RIPPLE_CAP)
  private readonly aurora = new Aurora()
  private readonly lightning = new Lightning()
  /** Faded 0..1 levels. */
  private level = { rain: 0, snow: 0, aurora: 0, storm: 0 }
  private readonly cam = new Vector3()
  private readonly fwd = new Vector3()
  private readonly center = new Vector3()
  private readonly wind = new Vector3()
  private readonly vel = new Vector3()
  private clock = 0
  private readonly release: () => void

  constructor(private readonly host: WeatherHost) {
    this.root.name = "weather"
    this.root.add(this.rain.mesh, this.snow.mesh, this.ripples.mesh, this.aurora.mesh, this.lightning.sky, this.lightning.pulse, this.lightning.bolt)
    this.release = host.local.add(this.root, () => {
      this.rain.dispose()
      this.snow.dispose()
      this.ripples.dispose()
      this.aurora.dispose()
      this.lightning.dispose()
    })
  }

  /** The current faded levels (for the HUD or tests). */
  get state(): Readonly<{ rain: number; snow: number; aurora: number; storm: number; flash: number }> {
    return { ...this.level, flash: this.lightning.flash }
  }

  update(dt: number): void {
    if (!(dt > 0)) return
    dt = Math.min(dt, 0.1)
    this.clock += dt
    const sky = currentSky()
    const night = nightFactor(sky)
    const p = this.host.player.position
    const frost = zoneAt(p.x, p.z) === FROST
    const fall = PRECIP[sky.weather] ?? 0
    const lv = this.level
    lv.rain = approach(lv.rain, frost ? 0 : fall, dt)
    lv.snow = approach(lv.snow, frost ? fall : 0, dt)
    lv.storm = approach(lv.storm, sky.weather === "storm" ? 1 : 0, dt)
    lv.aurora = approach(lv.aurora, sky.weather === "aurora" ? night : 0, dt)
    const low = quality.level === "low"
    const share = low ? 0.5 : 1

    const camera = this.host.camera
    this.cam.setFromMatrixPosition(camera.matrixWorld)
    camera.getWorldDirection(this.fwd)
    this.fwd.y = 0
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1)
    this.fwd.normalize()

    // wind: a slow turn shared by everyone (server clock), gusting; storms blow hard
    const t = this.clock
    const angle = (serverNow() / 1000) * 0.004 + 1.1
    const gust = 1 + 0.25 * Math.sin(t * 0.9) + 0.15 * Math.sin(t * 2.3 + 1)
    const strength = (0.8 + lv.storm * 6.5) * gust
    this.wind.set(Math.cos(angle) * strength, 0, Math.sin(angle) * strength)

    this.lightning.step(dt, lv.storm, this.cam, this.fwd, low)
    const flash = this.lightning.flash
    const light = (1 - night * 0.55) * (1 - lv.storm * 0.12)

    // rain and snow fill a box a little ahead of the camera
    if (lv.rain > 0 || this.rain.mesh.visible) {
      this.center.copy(this.cam).addScaledVector(this.fwd, 9)
      this.center.y = this.cam.y + 1
      this.vel.copy(this.wind).setY(-(12 + 4 * lv.storm))
      this.rain.step(this.center, this.vel, dt, lv.rain, RAIN_CAP * share)
      this.rain.light.value = light + flash * 0.7
    }
    if (lv.snow > 0 || this.snow.mesh.visible) {
      this.center.copy(this.cam).addScaledVector(this.fwd, 7)
      this.center.y = this.cam.y + 0.5
      this.vel.copy(this.wind).multiplyScalar(0.7).setY(-(1.25 + 0.6 * lv.storm))
      this.snow.step(this.center, this.vel, dt, lv.snow, SNOW_CAP * share)
      this.snow.light.value = (1 - night * 0.4) + flash * 0.5
    }
    if (!low && (lv.rain > 0 || this.ripples.mesh.visible)) {
      this.center.copy(this.cam).addScaledVector(this.fwd, 9)
      this.ripples.step(this.center, lv.rain)
      this.ripples.light.value = light + flash * 0.6
    } else if (this.ripples.mesh.visible) this.ripples.step(this.center, 0)

    this.aurora.step(this.cam, lv.aurora, low)
  }

  dispose(): void {
    this.release()
  }
}
