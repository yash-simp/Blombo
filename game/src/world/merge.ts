// Bakes many placed copies of pack geometry into one mesh geometry (one draw call per chunk and
// material): positions and normals transformed, vertex colours kept as normalized bytes.
import { BufferAttribute, BufferGeometry, Matrix3, type Matrix4, Vector3 } from "three"

export interface MergeItem {
  geometry: BufferGeometry
  matrix: Matrix4
}

const v = new Vector3()
const nm = new Matrix3()

export function mergeItems(items: MergeItem[]): BufferGeometry | null {
  let vertices = 0
  let indices = 0
  for (const it of items) {
    const count = it.geometry.getAttribute("position").count
    vertices += count
    indices += it.geometry.index ? it.geometry.index.count : count
  }
  if (!vertices) return null
  const pos = new Float32Array(vertices * 3)
  const nor = new Float32Array(vertices * 3)
  const col = new Uint8Array(vertices * 4)
  const idx = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)
  let vo = 0
  let io = 0
  for (const it of items) {
    const g = it.geometry
    const p = g.getAttribute("position")
    const n = g.getAttribute("normal")
    const c = g.getAttribute("color")
    nm.getNormalMatrix(it.matrix)
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(it.matrix)
      pos[(vo + i) * 3] = v.x
      pos[(vo + i) * 3 + 1] = v.y
      pos[(vo + i) * 3 + 2] = v.z
      if (n) {
        v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize()
        nor[(vo + i) * 3] = v.x
        nor[(vo + i) * 3 + 1] = v.y
        nor[(vo + i) * 3 + 2] = v.z
      } else nor[(vo + i) * 3 + 1] = 1
      if (c) {
        col[(vo + i) * 4] = Math.round(Math.min(1, c.getX(i)) * 255)
        col[(vo + i) * 4 + 1] = Math.round(Math.min(1, c.getY(i)) * 255)
        col[(vo + i) * 4 + 2] = Math.round(Math.min(1, c.getZ(i)) * 255)
        col[(vo + i) * 4 + 3] = c.itemSize > 3 ? Math.round(Math.min(1, c.getW(i)) * 255) : 255
      } else col.fill(255, (vo + i) * 4, (vo + i) * 4 + 4)
    }
    if (g.index) {
      for (let k = 0; k < g.index.count; k++) idx[io + k] = g.index.getX(k) + vo
      io += g.index.count
    } else {
      for (let k = 0; k < p.count; k++) idx[io + k] = vo + k
      io += p.count
    }
    vo += p.count
  }
  const out = new BufferGeometry()
  out.setAttribute("position", new BufferAttribute(pos, 3))
  out.setAttribute("normal", new BufferAttribute(nor, 3))
  out.setAttribute("color", new BufferAttribute(col, 4, true))
  out.setIndex(new BufferAttribute(idx, 1))
  out.computeBoundingSphere()
  out.computeBoundingBox()
  return out
}
