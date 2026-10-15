// A glowing column and spinning ring that marks where the current goal is.
import { AdditiveBlending, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, type Vector3 } from "three"

/** Metres from the goal at which the column fades away (the spot is plainly in view). */
const HIDE_WITHIN = 10

export class Beacon {
  readonly root = new Group()
  private readonly beam: Mesh
  private readonly ring: Mesh
  private readonly geos = [new CylinderGeometry(0.35, 0.8, 14, 16, 1, true), new RingGeometry(0.9, 1.25, 32)]
  private readonly mats = [
    new MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    new MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.85, depthWrite: false, side: DoubleSide }),
  ]
  constructor() {
    this.beam = new Mesh(this.geos[0], this.mats[0])
    this.beam.position.y = 7
    this.geos[1]!.rotateX(-Math.PI / 2)
    this.ring = new Mesh(this.geos[1], this.mats[1])
    this.root.add(this.beam, this.ring)
    this.root.visible = false
  }
  /** Shows the beacon at a point (feet level), or hides it. */
  set(target: Vector3 | null, playerDist: number, t: number): void {
    this.root.visible = !!target && playerDist > HIDE_WITHIN
    if (!target) return
    this.root.position.copy(target)
    this.ring.position.y = 0.12
    this.ring.rotation.y = t * 1.5
    const s = 1 + Math.sin(t * 4) * 0.12
    this.ring.scale.set(s, 1, s)
    ;(this.mats[0] as MeshBasicMaterial).opacity = 0.22 + Math.sin(t * 3) * 0.08
  }
  dispose(): void {
    this.geos.forEach((g) => g.dispose())
    this.mats.forEach((m) => m.dispose())
  }
}
