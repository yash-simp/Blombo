// Harness stand-in for @blombo/game-runtime: only what the client imports as values.
import { MeshBasicNodeMaterial } from "three/webgpu"
import { color, dot, max, mix, normalWorld, uniform } from "three/tsl"
import { Color, Vector3 } from "three"

/**
 * The room light as engine/rendering.txt documents it, fed by the api shim's setEnvironment:
 * face = colour x light x tint x brightness/100, light = mix(ground, sky, N.y/2 + 1/2) + sun x max(N.S, 0).
 * No sun shadows (the harness has no shadow pass).
 */
export const light = {
  sun: uniform(new Color(0xfff1dc).multiplyScalar(0.83)),
  sky: uniform(new Color(0xd6e6ff).multiplyScalar(0.57)),
  ground: uniform(new Color(0xe6dccb).multiplyScalar(0.36)),
  dir: uniform(new Vector3(0.52, 0.82, 0.24)),
  tint: uniform(new Color(0xffffff)),
  brightness: uniform(1.08),
  fog: { color: new Color(0xd8ecfb), near: 50, far: 200 },
}
/** fog.density step -> far metres (near = far x 0.25). */
const FOG_FAR = [0, 200, 160, 125, 100, 80, 62, 50, 40, 32, 25, 20, 16, 13, 10, 8, 6, 5, 4, 3, 2]
const DAY_SKY = new Color(0xd6e6ff)
const DAY_GROUND = new Color(0xe6dccb)

export interface Environment {
  fog: number
  fogColor: number
  brightness: number
  tint: number
  sunAzimuth: number
  sunElevation: number
  sunColor: number
  shadeColor: number
  shading: number
}
export function setEnvironment(env: Environment): void {
  // shading 50: sun 0.8, sky 0.6, ground 0.38; 100: 1.1, 0.3, 0.16; 0: flat
  const s = env.shading / 100
  const k = s <= 0.5 ? s / 0.5 : 1
  const hard = s > 0.5 ? (s - 0.5) / 0.5 : 0
  const sunK = k * 0.8 + hard * 0.3
  const skyK = 1 - k * 0.4 - hard * 0.3
  const groundK = 1 - k * 0.62 - hard * 0.22
  const shade = new Color(env.shadeColor)
  light.sun.value.set(env.sunColor).multiplyScalar(sunK)
  light.sky.value.copy(shade).multiplyScalar(skyK)
  // the ground light keeps its warm bias against the default sky colour
  light.ground.value.setRGB(
    shade.r * (DAY_GROUND.r / DAY_SKY.r) * groundK,
    shade.g * (DAY_GROUND.g / DAY_SKY.g) * groundK,
    shade.b * (DAY_GROUND.b / DAY_SKY.b) * groundK,
  )
  const az = (env.sunAzimuth * Math.PI) / 180
  const el = (env.sunElevation * Math.PI) / 180
  light.dir.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
  if (env.sunElevation <= 0) light.sun.value.setRGB(0, 0, 0)
  light.tint.value.set(env.tint)
  light.brightness.value = env.brightness / 100
  light.fog.color.set(env.fogColor)
  light.fog.far = FOG_FAR[Math.max(0, Math.min(20, Math.round(env.fog)))] || 1e6
  light.fog.near = light.fog.far * 0.25
}

/** Approximates the engine's part shading (sun, sky/ground light, tint, brightness). */
export function toonMaterial(options: { color?: number; castShadow?: boolean } = {}) {
  const m = new MeshBasicNodeMaterial()
  const lit = mix(light.ground, light.sky, normalWorld.y.mul(0.5).add(0.5)).add(light.sun.mul(max(dot(normalWorld, light.dir), 0)))
  m.colorNode = color(options.color ?? 0xffffff).mul(lit).mul(light.tint).mul(light.brightness)
  return m
}
export function box(o: unknown) {
  return o
}
export function createGame() {
  throw new Error("harness: createGame is mocked by mock/game.ts")
}
