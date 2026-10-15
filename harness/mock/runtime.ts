// Harness stand-in for @blombo/game-runtime: only what the client imports as values.
import { MeshBasicNodeMaterial } from "three/webgpu"
import { color, dot, max, normalWorld, vec3 } from "three/tsl"

/** Approximates the engine's part shading: colour × a soft sun term. */
export function toonMaterial(options: { color?: number; castShadow?: boolean } = {}) {
  const m = new MeshBasicNodeMaterial()
  const sun = vec3(0.45, 0.8, 0.35).normalize()
  const lit = max(dot(normalWorld, sun), 0).mul(0.42).add(0.66)
  m.colorNode = color(options.color ?? 0xffffff).mul(lit)
  return m
}
export function box(o: unknown) {
  return o
}
export function createGame() {
  throw new Error("harness: createGame is mocked by mock/game.ts")
}
