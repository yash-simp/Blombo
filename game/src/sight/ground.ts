import type { ISightStage } from "@blombo/game-runtime/sight"
import { BufferGeometry, Float32BufferAttribute, Mesh, Vector3 } from "three"
import { World } from "../world/zones"
import { loadGroundDetail } from "../assets/materials"

/** Ground kept around a spot on the plaza edge (metres), so the views frame it close enough to show the detail. */
const RADIUS = 6
const CENTRE = new Vector3(4, 0, 40)

/**
 * The Lantern Lake plaza at night in rain (server/sky.ts values): only the terrain and paving near the
 * fountain, on the game's ground material, to check the detail texture and night light in the engine.
 */
export default async function sight(stage: ISightStage) {
  stage.environment({
    fog: { density: 4, color: 0x424c59 },
    light: { brightness: 56, tint: 0xccd4ea, sunColor: 0xccdaff, shadeColor: 0x8c96b4, sunAzimuth: 200, sunElevation: 50, shading: 55 },
  })
  const world = new World({ t: (key) => key, local: { add: () => () => {} } })
  world.drawSea = false
  await world.load(0)
  await loadGroundDetail()
  const view = world.zones.get(0)!
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  for (const mesh of view.ground) {
    mesh.updateWorldMatrix(true, false)
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry
    const pos = g.getAttribute("position")
    const nor = g.getAttribute("normal")
    const col = g.getAttribute("color")
    const out: { p: number[]; n: number[]; c: number[] } = { p: [], n: [], c: [] }
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
      b.fromBufferAttribute(pos, i + 1).applyMatrix4(mesh.matrixWorld)
      c.fromBufferAttribute(pos, i + 2).applyMatrix4(mesh.matrixWorld)
      const cx = (a.x + b.x + c.x) / 3 - CENTRE.x
      const cz = (a.z + b.z + c.z) / 3 - CENTRE.z
      if (cx * cx + cz * cz > RADIUS * RADIUS) continue
      for (const [k, v] of [a, b, c].entries()) {
        out.p.push(v.x, v.y, v.z)
        out.n.push(nor.getX(i + k), nor.getY(i + k), nor.getZ(i + k))
        out.c.push(col.getX(i + k), col.getY(i + k), col.getZ(i + k), col.itemSize > 3 ? col.getW(i + k) : 1)
      }
    }
    if (!out.p.length) continue
    const cut = new BufferGeometry()
    cut.setAttribute("position", new Float32BufferAttribute(out.p, 3))
    cut.setAttribute("normal", new Float32BufferAttribute(out.n, 3))
    cut.setAttribute("color", new Float32BufferAttribute(out.c, 4))
    stage.add(new Mesh(cut, mesh.material))
  }
}
