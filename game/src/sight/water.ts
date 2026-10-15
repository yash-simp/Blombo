import type { ISightStage } from "@blombo/game-runtime/sight"
import { Float32BufferAttribute, Mesh, PlaneGeometry } from "three"
import { MeshBasicNodeMaterial } from "three/webgpu"
import * as TSL from "three/tsl"
import { WATER_PALETTES, waterMaterial } from "../world/water"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L = TSL as any

export default function sight(stage: ISightStage) {
  const plane = new PlaneGeometry(20, 20, 20, 20)
  plane.rotateX(-Math.PI / 2)
  const n = plane.getAttribute("position").count
  const c = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    const x = plane.getAttribute("position").getX(i)
    c.set([Math.max(0, x + 10) / 20, x < -8 ? 1 : 0, 0, 1], i * 4)
  }
  plane.setAttribute("color", new Float32BufferAttribute(c, 4))
  const a = new Mesh(plane, waterMaterial(WATER_PALETTES[0]!))
  stage.add(a)
  const simple = new MeshBasicNodeMaterial()
  simple.colorNode = L.color(0x2266ff)
  const b = new Mesh(plane, simple)
  b.position.x = 22
  stage.add(b)
  const vc = new MeshBasicNodeMaterial()
  vc.colorNode = L.vertexColor().mul(L.color(0x00ff00))
  const d = new Mesh(plane, vc)
  d.position.x = 44
  stage.add(d)
}
