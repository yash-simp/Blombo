// World geometry helpers shared by the server and the browser: zone anchors in world metres and the
// water masks the Blender pipeline exported (server/world.gen.ts).
import { ZONES } from "./rules.ts"
import { ZONE_DATA } from "./world.gen.ts"

export interface Anchor {
  x: number
  y: number
  z: number
  yaw: number
}

/** A named anchor of a zone in world coordinates, or null when the zone has no such anchor. */
export function anchor(zone: number, name: string): Anchor | null {
  const data = ZONE_DATA[zone]
  const a = data?.anchors[name]
  const center = ZONES[zone]
  if (!a || !center || typeof a[0] !== "number") return null
  const v = a as number[]
  return { x: center.x + (v[0] ?? 0), y: v[1] ?? 1, z: center.z + (v[2] ?? 0), yaw: v[3] ?? 0 }
}

/** All entries of a list anchor (home plots) in world coordinates. */
export function anchorList(zone: number, name: string): Anchor[] {
  const data = ZONE_DATA[zone]
  const list = data?.anchors[name]
  const center = ZONES[zone]
  if (!list || !center || !Array.isArray(list[0])) return []
  return (list as number[][]).map((v) => ({ x: center.x + (v[0] ?? 0), y: v[1] ?? 1, z: center.z + (v[2] ?? 0), yaw: v[3] ?? 0 }))
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
function decodeBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, "")
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let buffer = 0
  let bits = 0
  let o = 0
  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | B64.indexOf(clean[i]!)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (buffer >> bits) & 0xff
    }
  }
  return out
}

const masks: (Uint8Array | null)[] = []
/** True when the world point is open water of `zone` (a cast may land there). */
export function isWater(zone: number, x: number, z: number): boolean {
  const data = ZONE_DATA[zone]
  const center = ZONES[zone]
  if (!data || !center) return false
  let bits = masks[zone]
  if (bits === undefined) {
    bits = decodeBase64(data.mask.bits)
    masks[zone] = bits
  }
  if (!bits) return false
  const { n, cell, ext } = data.mask
  const i = Math.floor((x - center.x + ext) / cell)
  const j = Math.floor((z - center.z + ext) / cell)
  if (i < 0 || j < 0 || i >= n || j >= n) return true // beyond the island square: open sea
  const k = j * n + i
  return ((bits[k >> 3]! >> (7 - (k & 7))) & 1) === 1
}

/** Searches a few metres around a point for water (aim assist) and returns the nearest water point. */
export function nearestWater(zone: number, x: number, z: number, radius: number): { x: number; z: number } | null {
  if (isWater(zone, x, z)) return { x, z }
  for (let r = 1; r <= radius; r += 1) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      const px = x + Math.cos(a) * r
      const pz = z + Math.sin(a) * r
      if (isWater(zone, px, pz)) return { x: px, z: pz }
    }
  }
  return null
}

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz)
}
