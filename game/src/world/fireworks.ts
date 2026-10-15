// Fireworks: rockets that climb on a sparkling trail and burst into coloured sparks. Every spark is an
// instanced camera-facing quad moved entirely on the GPU from its launch data (start, velocity, drag,
// gravity, birth time), so a show costs one draw call and no per-frame uploads; the mesh hides itself
// when the last spark has faded. Sparks blend "premultiplied": a soft additive glow around a core that
// also covers what is behind it, so colours stay saturated against a bright day sky.
import {
  CustomBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  Vector3,
} from "three"
import { MeshBasicNodeMaterial } from "three/webgpu"
import * as TSL from "three/tsl"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L = TSL as any

export type BurstKind = "peony" | "ring" | "willow" | "crackle"

export interface Rocket {
  /** Launch point and burst point (world). */
  from: Vector3
  to: Vector3
  /** Seconds from now. */
  delay: number
  /** One or two burst colours (0xrrggbb). */
  colors: number[]
  kind: BurstKind
  /** Burst size factor (1 = about 10 m across). */
  power?: number
}

const TRAIL = 0xffc27a
const WHITE = 0xfff4dc

export class Fireworks {
  readonly mesh: Mesh
  /** Brightness of the whole show. */
  readonly intensity: { value: number } = L.uniform(1)
  /** Spark count factor (low quality halves the bursts). */
  density = 1
  private readonly time: { value: number } = L.uniform(0)
  private readonly start: InstancedBufferAttribute
  private readonly vel: InstancedBufferAttribute
  private readonly color: InstancedBufferAttribute
  private readonly phys: InstancedBufferAttribute
  private readonly geometry: InstancedBufferGeometry
  private readonly material: MeshBasicNodeMaterial
  private clock = 0
  private next = 0
  private used = 0
  private until = 0
  private dirty = false

  constructor(readonly capacity = 2048) {
    const plane = new PlaneGeometry(1, 1)
    const geometry = new InstancedBufferGeometry()
    geometry.index = plane.index
    geometry.setAttribute("position", plane.getAttribute("position"))
    geometry.setAttribute("uv", plane.getAttribute("uv"))
    const attr = () => new InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
    this.start = attr()
    this.vel = attr()
    this.color = attr()
    this.phys = attr()
    geometry.setAttribute("aStart", this.start)
    geometry.setAttribute("aVel", this.vel)
    geometry.setAttribute("aColor", this.color)
    geometry.setAttribute("aPhys", this.phys)
    geometry.instanceCount = 0
    this.geometry = geometry

    // start.xyz + birth time, velocity + life, colour + size, drag / gravity / twinkle / seed
    const s = L.instancedBufferAttribute(this.start)
    const v = L.instancedBufferAttribute(this.vel)
    const c = L.instancedBufferAttribute(this.color)
    const ph = L.instancedBufferAttribute(this.phys)
    const age = L.sub(this.time, s.w)
    const alive = L.step(0, age).mul(L.step(age, v.w))
    const a0 = L.max(age, 0)
    const k = L.clamp(a0.div(v.w), 0, 1)
    const drag = L.max(ph.x, 0.001)
    // with air drag the burst opens fast, then hangs and droops
    const travel = L.float(1).sub(L.exp(drag.negate().mul(a0))).div(drag)
    const center = s.xyz.add(v.xyz.mul(travel)).sub(L.vec3(0, ph.y.mul(a0).mul(a0).mul(0.5), 0))
    const size = c.w.mul(L.float(1).sub(k.mul(0.55))).mul(alive)
    const view = L.cameraViewMatrix.mul(L.vec4(center, 1))
    const p = view.xyz.add(L.vec3(L.positionLocal.x.mul(size), L.positionLocal.y.mul(size), 0))
    const material = new MeshBasicNodeMaterial()
    material.vertexNode = L.cameraProjectionMatrix.mul(L.vec4(p, 1))
    // white-hot at first, then its colour, fading out; crackling sparks flicker as they die
    const fade = L.pow(L.float(1).sub(k), 1.5)
    const flicker = L.step(0.4, L.fract(a0.mul(13).add(ph.w.mul(7))))
    const twinkle = L.mix(L.float(1), flicker, ph.z.mul(L.smoothstep(0.3, 0.55, k)))
    const hot = L.float(1).sub(L.smoothstep(0, 0.12, k))
    const tint = L.varying(L.mix(c.xyz, L.vec3(1, 0.97, 0.9), hot.mul(0.6)).mul(fade).mul(twinkle))
    const d = L.length(L.uv().sub(L.vec2(0.5, 0.5))).mul(2)
    const fall = L.clamp(L.float(1).sub(d), 0, 1)
    const core = L.smoothstep(0.4, 0.8, fall)
    // a saturated core (not blown out to white) inside a softer glow
    material.colorNode = tint.mul(core.mul(0.95).add(fall.mul(fall).mul(0.5))).mul(this.intensity)
    // the core also covers the sky behind it (alpha); the glow around it only adds light
    material.opacityNode = core.mul(0.85).mul(L.min(L.length(tint), 1))
    material.transparent = true
    material.depthWrite = false
    material.blending = CustomBlending
    material.blendSrc = OneFactor
    material.blendDst = OneMinusSrcAlphaFactor
    material.fog = false
    this.material = material
    this.mesh = new Mesh(geometry, material)
    this.mesh.name = "fireworks"
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 6
    this.mesh.visible = false
  }

  /** True while a show is in the air. */
  get busy(): boolean {
    return this.clock < this.until
  }

  update(dt: number): void {
    this.clock += dt
    this.time.value = this.clock
    if (this.dirty) {
      for (const a of [this.start, this.vel, this.color, this.phys]) a.needsUpdate = true
      this.geometry.instanceCount = this.used
      this.dirty = false
    }
    this.mesh.visible = this.clock < this.until
  }

  /** Schedules a rocket: a climbing trail, a flash and the burst. */
  launch(r: Rocket): void {
    const power = r.power ?? 1
    const birth = this.clock + Math.max(0, r.delay)
    const flight = 0.95 + Math.random() * 0.35
    // the head slows as it climbs (drag 1.4): pick the launch speed that lands it on the burst point
    const dragUp = 1.4
    const reach = (1 - Math.exp(-dragUp * flight)) / dragUp
    const dx = (r.to.x - r.from.x) / reach
    const dy = (r.to.y - r.from.y) / reach
    const dz = (r.to.z - r.from.z) / reach
    this.spark(r.from.x, r.from.y, r.from.z, birth, dx, dy, dz, flight, WHITE, 0.9, dragUp, 0, 0)
    const steps = 10
    for (let i = 1; i < steps; i++) {
      const at = (flight * i) / steps
      const f = (1 - Math.exp(-dragUp * at)) / dragUp
      this.spark(r.from.x + dx * f, r.from.y + dy * f, r.from.z + dz * f, birth + at, rnd(0.5), rnd(0.3) - 0.4, rnd(0.5), 0.45 + Math.random() * 0.35, TRAIL, 0.55, 2, 1.5, 0.6)
    }
    const burst = birth + flight
    const c0 = r.colors[0] ?? WHITE
    const c1 = r.colors[1] ?? c0
    this.spark(r.to.x, r.to.y, r.to.z, burst, 0, 0, 0, 0.3, mix(c0, WHITE, 0.5), 9 * power, 1, 0, 0)
    const n = Math.max(12, Math.round(60 * power * this.density))
    // a random tilt for ring bursts
    const tilt = new Vector3(rnd(1), 1, rnd(1)).normalize()
    const u = new Vector3(1, 0, 0).cross(tilt).normalize()
    const w = new Vector3().crossVectors(tilt, u)
    const dir = new Vector3()
    for (let i = 0; i < n; i++) {
      let speed = 8.5 * power * (0.85 + Math.random() * 0.3)
      let life = 1.5 + Math.random() * 0.6
      let drag = 1.7
      let gravity = 2.6
      let twinkle = 0
      let size = 1.3 * Math.sqrt(power)
      if (r.kind === "ring") {
        const a = (i / n) * Math.PI * 2
        dir.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a))
        speed = 9.5 * power
      } else {
        // evenly spread over a sphere (golden spiral) with a little jitter
        const y = 1 - (2 * (i + 0.5)) / n
        const rr = Math.sqrt(1 - y * y)
        const a = i * 2.39996 + Math.random() * 0.2
        dir.set(Math.cos(a) * rr, y, Math.sin(a) * rr)
      }
      if (r.kind === "willow") {
        speed *= 0.75
        life = 2.6 + Math.random() * 0.8
        drag = 2.3
        gravity = 4.5
        twinkle = 0.35
        size *= 0.85
      } else if (r.kind === "crackle") {
        life = 1.3 + Math.random() * 0.5
        twinkle = 1
      }
      this.spark(r.to.x, r.to.y, r.to.z, burst, dir.x * speed, dir.y * speed, dir.z * speed, life, i % 2 ? c1 : c0, size, drag, gravity, twinkle)
    }
  }

  private spark(x: number, y: number, z: number, birth: number, vx: number, vy: number, vz: number, life: number, color: number, size: number, drag: number, gravity: number, twinkle: number): void {
    const i = this.next
    this.next = (this.next + 1) % this.capacity
    this.used = Math.max(this.used, i + 1)
    this.start.setXYZW(i, x, y, z, birth)
    this.vel.setXYZW(i, vx, vy, vz, life)
    this.color.setXYZW(i, ((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255, size)
    this.phys.setXYZW(i, drag, gravity, twinkle, Math.random())
    this.until = Math.max(this.until, birth + life)
    this.dirty = true
  }

  /** Stops the show at once. */
  clear(): void {
    this.until = 0
    this.mesh.visible = false
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}

function rnd(spread: number): number {
  return (Math.random() * 2 - 1) * spread
}

function mix(a: number, b: number, k: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - k) + ((b >> shift) & 255) * k) << shift
  return ch(16) | ch(8) | ch(0)
}
