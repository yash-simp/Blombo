// Camera-facing glowing quads drawn in one call: lantern halos, fireflies, sparkles.
import { AdditiveBlending, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry } from "three"
import { MeshBasicNodeMaterial } from "three/webgpu"
import * as TSL from "three/tsl"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L = TSL as any

export class Billboards {
  readonly mesh: Mesh
  readonly intensity: { value: number } = L.uniform(1)
  private readonly centers: InstancedBufferAttribute
  private readonly colors: InstancedBufferAttribute
  private readonly geometry: InstancedBufferGeometry
  private readonly material: MeshBasicNodeMaterial
  count = 0

  constructor(
    readonly capacity: number,
    mode: "halo" | "firefly" = "halo",
  ) {
    const plane = new PlaneGeometry(1, 1)
    const geometry = new InstancedBufferGeometry()
    geometry.index = plane.index
    geometry.setAttribute("position", plane.getAttribute("position"))
    geometry.setAttribute("uv", plane.getAttribute("uv"))
    this.centers = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
    this.colors = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
    geometry.setAttribute("aCenter", this.centers)
    geometry.setAttribute("aColor", this.colors)
    geometry.instanceCount = 0
    this.geometry = geometry
    const c = L.instancedBufferAttribute(this.centers)
    const col = L.instancedBufferAttribute(this.colors)
    const phase = col.w
    const t = L.time
    let center = c.xyz
    if (mode === "firefly") {
      center = center.add(
        L.vec3(L.sin(t.mul(0.7).add(phase.mul(6))).mul(0.9), L.sin(t.mul(1.3).add(phase.mul(3))).mul(0.45), L.cos(t.mul(0.6).add(phase.mul(5))).mul(0.9)),
      )
    }
    const view = L.cameraViewMatrix.mul(L.vec4(center, 1))
    const p = view.xyz.add(L.vec3(L.positionLocal.x.mul(c.w), L.positionLocal.y.mul(c.w), 0))
    const material = new MeshBasicNodeMaterial()
    material.vertexNode = L.cameraProjectionMatrix.mul(L.vec4(p, 1))
    const d = L.length(L.uv().sub(L.vec2(0.5, 0.5))).mul(2)
    const fall = L.clamp(L.float(1).sub(d), 0, 1)
    let a = fall.mul(fall)
    if (mode === "firefly") a = a.mul(L.sin(t.mul(3).add(phase.mul(20))).mul(0.4).add(0.6))
    material.colorNode = col.xyz.mul(a).mul(this.intensity)
    material.transparent = true
    material.depthWrite = false
    material.blending = AdditiveBlending
    material.fog = false
    this.material = material
    this.mesh = new Mesh(geometry, material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 5
  }

  add(x: number, y: number, z: number, size: number, color: number, phase = Math.random()): number {
    if (this.count >= this.capacity) return -1
    const i = this.count++
    this.centers.setXYZW(i, x, y, z, size)
    this.colors.setXYZW(i, ((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255, phase)
    this.centers.needsUpdate = true
    this.colors.needsUpdate = true
    this.geometry.instanceCount = this.count
    return i
  }

  move(i: number, x: number, y: number, z: number, size?: number): void {
    this.centers.setXYZW(i, x, y, z, size ?? this.centers.getW(i))
    this.centers.needsUpdate = true
  }

  clear(): void {
    this.count = 0
    this.geometry.instanceCount = 0
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
