// Stylized water: depth-tinted (vertex colour r = depth / 6), shore foam (g), falling water (b), gentle
// waves, glints that sparkle more at night. Unlit and transparent; one material per zone palette.
import { MeshBasicNodeMaterial } from "three/webgpu"
import * as TSL from "three/tsl"
import { DoubleSide } from "three"

// Shader graphs are built with TSL's untyped chain API (its generics cannot follow node arithmetic).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L = TSL as any

export interface WaterPalette {
  shallow: number
  deep: number
  foam: number
  night: number
}

export const WATER_PALETTES: WaterPalette[] = [
  { shallow: 0x62d6cf, deep: 0x1d6aa6, foam: 0xffffff, night: 0x16285a },
  { shallow: 0x6fd6b8, deep: 0x26708e, foam: 0xf4fff8, night: 0x14304a },
  { shallow: 0x5ff0e0, deep: 0x1a7fc0, foam: 0xffffff, night: 0x10305a },
  { shallow: 0x9fe6ff, deep: 0x2f6a9a, foam: 0xffffff, night: 0x18305e },
  { shallow: 0x6fd8b0, deep: 0x22605e, foam: 0xfff0d8, night: 0x2a1c30 },
  { shallow: 0x8a9cff, deep: 0x2a2e88, foam: 0xd8f0ff, night: 0x1a1858 },
]

/** Shared uniforms the world updates every frame. */
export const waterUniforms: { night: { value: number }; light: { value: number } } = {
  night: L.uniform(0),
  light: L.uniform(1),
}

export function waterMaterial(palette: WaterPalette, opaque = false): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial()
  const vc = L.vertexColor()
  const depth = vc.r.mul(6)
  const deepT = L.smoothstep(0.0, 2.4, depth)
  const fall = vc.b
  const t = L.time
  const wx = L.positionWorld.x
  const wz = L.positionWorld.z
  const ripple = L.sin(wx.mul(0.45).add(t.mul(1.3))).mul(L.cos(wz.mul(0.38).sub(t.mul(1.1))))
  const night = waterUniforms.night
  const shallow = L.mix(L.color(palette.shallow), L.color(palette.night), L.float(night).mul(0.75))
  const deep = L.mix(L.color(palette.deep), L.color(palette.night), L.float(night).mul(0.6))
  const base = L.mix(shallow, deep, deepT)
  const foamWave = L.sin(t.mul(1.8).add(wx.mul(0.7)).add(wz.mul(0.5))).mul(0.1)
  const foam = L.smoothstep(0.62, 0.95, vc.g.add(ripple.mul(0.12)).add(foamWave))
  const g1 = L.sin(wx.mul(1.7).add(wz.mul(0.9)).add(t.mul(1.9))).mul(L.sin(wz.mul(2.3).sub(wx.mul(0.6)).sub(t.mul(1.4))))
  const g2 = L.sin(wx.mul(0.53).sub(wz.mul(1.31)).add(t.mul(0.7)))
  const glint = L.smoothstep(0.9, 0.99, g1.mul(L.smoothstep(-0.2, 0.8, g2)))
  const glintAmount = L.mix(L.float(0.25), L.float(0.75), night)
  let col = L.mix(base, L.color(palette.foam), foam.mul(0.85))
  col = col.add(L.vec3(1, 1, 1).mul(glint.mul(glintAmount)))
  col = col.add(L.vec3(0.02, 0.05, 0.08).mul(ripple))
  // falling water: bright streaks scrolling down
  const stripe = L.fract(L.positionLocal.y.mul(0.9).add(t.mul(2.6)).add(L.sin(L.positionLocal.x.mul(2.7)).mul(0.25)))
  const fallCol = L.mix(L.color(0xbfeeff), L.color(0xffffff), L.smoothstep(0.55, 0.85, stripe))
  col = L.mix(col, fallCol, fall)
  m.colorNode = col.mul(waterUniforms.light)
  m.opacityNode = L.clamp(L.mix(L.float(0.55), L.float(opaque ? 1 : 0.9), deepT).add(foam.mul(0.4)).add(fall.mul(0.3)), 0, 1)
  const wave = L.sin(wx.mul(0.32).add(t.mul(1.1))).mul(0.05).add(L.cos(wz.mul(0.27).add(t.mul(0.8))).mul(0.05))
  m.positionNode = L.positionLocal.add(L.vec3(0, wave.mul(L.float(1).sub(fall)), 0))
  m.transparent = true
  m.depthWrite = false
  m.side = DoubleSide
  m.name = "water"
  return m
}
