// Local water and reward effects: splash rings, droplets and sparkle bursts, pooled.
import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry, type Object3D } from "three"

interface Ring {
  mesh: Mesh
  life: number
  max: number
  size: number
}
interface Drop {
  mesh: Mesh
  life: number
  vx: number
  vy: number
  vz: number
}

export class Fx {
  readonly root = new Group()
  private readonly rings: Ring[] = []
  private readonly drops: Drop[] = []
  private readonly sparks: Drop[] = []
  private readonly ringGeo = new RingGeometry(0.42, 0.5, 28)
  private readonly dropGeo = new SphereGeometry(0.06, 6, 4)
  private readonly sparkGeo = new SphereGeometry(0.05, 6, 4)
  private readonly ringMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })
  private readonly dropMat = new MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.95 })
  private readonly sparkMats = [0xffe27a, 0xffffff, 0x9ff0ff, 0xff9fd6].map(
    (c) => new MeshBasicMaterial({ color: c, transparent: true, blending: AdditiveBlending, depthWrite: false }),
  )

  constructor() {
    this.ringGeo.rotateX(-Math.PI / 2)
  }

  /** Expanding foam rings and droplets where something touches the water. */
  splash(x: number, z: number, strength = 1): void {
    for (let k = 0; k < (strength > 1.4 ? 3 : 2); k++) {
      const mesh = new Mesh(this.ringGeo, this.ringMat.clone())
      mesh.position.set(x, 0.07, z)
      this.root.add(mesh)
      this.rings.push({ mesh, life: 0, max: 0.9 + k * 0.35, size: (0.8 + k * 0.9) * strength })
    }
    const n = Math.round(7 * strength)
    for (let k = 0; k < n; k++) {
      const mesh = new Mesh(this.dropGeo, this.dropMat)
      mesh.position.set(x, 0.1, z)
      const a = Math.random() * Math.PI * 2
      const s = (0.8 + Math.random() * 1.6) * strength
      this.root.add(mesh)
      this.drops.push({ mesh, life: 0, vx: Math.cos(a) * s, vy: (2.2 + Math.random() * 2.2) * Math.sqrt(strength), vz: Math.sin(a) * s })
    }
  }

  /** A burst of glittering sparks (shiny fish, rewards). */
  sparkle(x: number, y: number, z: number, count = 18, speed = 2.5): void {
    for (let k = 0; k < count; k++) {
      const mesh = new Mesh(this.sparkGeo, this.sparkMats[k % this.sparkMats.length]!)
      mesh.position.set(x, y, z)
      const a = Math.random() * Math.PI * 2
      const e = Math.random() * Math.PI - Math.PI / 2
      const s = speed * (0.4 + Math.random() * 0.8)
      this.root.add(mesh)
      this.sparks.push({ mesh, life: 0, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 1.5, vz: Math.sin(a) * Math.cos(e) * s })
    }
  }

  update(dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!
      r.life += dt
      const t = r.life / r.max
      const s = 0.3 + t * r.size * 2
      r.mesh.scale.set(s, 1, s)
      ;(r.mesh.material as MeshBasicMaterial).opacity = 0.85 * (1 - t)
      if (t >= 1) {
        this.root.remove(r.mesh)
        ;(r.mesh.material as MeshBasicMaterial).dispose()
        this.rings.splice(i, 1)
      }
    }
    this.step(this.drops, dt, 12, 0.9)
    this.step(this.sparks, dt, 4, 1.3)
  }

  private step(list: Drop[], dt: number, gravity: number, max: number): void {
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i]!
      d.life += dt
      d.vy -= gravity * dt
      d.mesh.position.x += d.vx * dt
      d.mesh.position.y += d.vy * dt
      d.mesh.position.z += d.vz * dt
      const s = Math.max(0.01, 1 - d.life / max)
      d.mesh.scale.setScalar(s)
      if (d.life >= max || d.mesh.position.y < -0.2) {
        this.root.remove(d.mesh)
        list.splice(i, 1)
      }
    }
  }

  dispose(): void {
    this.ringGeo.dispose()
    this.dropGeo.dispose()
    this.sparkGeo.dispose()
    this.ringMat.dispose()
    this.dropMat.dispose()
    for (const m of this.sparkMats) m.dispose()
  }

  attachTo(parent: Object3D): void {
    parent.add(this.root)
  }
}
