import { box, createGame, type IGame, type IGameAuthoring } from "@blombo/game-runtime"
import { ZONES } from "../server/rules.ts"
import { ZONE_DATA } from "../server/world.gen.ts"
import { ZONE_COLLIDERS } from "./world/colliders.gen"
import { cloneRoot } from "./assets/packs"
import type { World } from "./world/zones"

/**
 * The world's solid shape. Everything players see is drawn by the browser from the Blender packs
 * (src/world/zones.ts); here are only the invisible colliders the pipeline exported for each island:
 * ground slabs at y = 1, walls along the walkable edges, buildings, trees and rocks.
 */
const MAX_PART = 120

export function buildWorld(game: IGameAuthoring): void {
  const spawn = ZONE_DATA[0]?.anchors.spawn as number[] | undefined
  game.setSpawn({ x: spawn?.[0] ?? 0, y: spawn?.[1] ?? 1, z: spawn?.[2] ?? 40 }, spawn?.[3] ?? 0)
  game.setKillPlane(-12)
  game.enablePortrait()
  game.setEnvironment({
    sky: "cartoon-airbrush-fluffybluesky",
    fog: { density: 1, color: 0xd8ecfb },
    light: { brightness: 105, shading: 55, sunAzimuth: 120, sunElevation: 50 },
  })
  const parts = []
  for (let z = 0; z < ZONES.length; z++) {
    const center = ZONES[z]!
    for (const c of ZONE_COLLIDERS[z] ?? []) {
      const [x, y, cz, w, h, d, yaw] = c as [number, number, number, number, number, number, number]
      // A part spans at most 128 m: wide slabs become a grid of tiles turned with the slab.
      const nx = Math.ceil(w / MAX_PART)
      const nz = Math.ceil(d / MAX_PART)
      const cos = Math.cos(yaw)
      const sin = Math.sin(yaw)
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const ox = (i + 0.5) * (w / nx) - w / 2
          const oz = (j + 0.5) * (d / nz) - d / 2
          parts.push(
            box({
              at: { x: center.x + x + ox * cos + oz * sin, y, z: center.z + cz - ox * sin + oz * cos },
              size: { x: Math.max(0.1, w / nx), y: Math.max(0.1, h), z: Math.max(0.1, d / nz) },
              yaw,
              transparent: true,
            }),
          )
        }
      }
    }
  }
  game.world.addParts(parts)
}

/** Rod keys the server equips: "rod_<rod id>" and "rod_skin_<skin>". */
export const ROD_KEYS = ["twig", "bamboo", "willow", "oak", "carbon", "coral", "frost", "magma", "moon", "star"]
export const SKIN_KEYS = ["lantern", "willow", "coral", "frost", "ember", "moon", "rainbow", "dragon", "candy"]

export interface Started {
  game: IGame
  world: World
}

export async function startGame(canvas: HTMLCanvasElement, touchLayer: HTMLElement): Promise<Started> {
  const game = await createGame({ canvas, touchLayer, cameraDistance: 7 })
  game.configureTouchControls({ buttons: { punch: { visible: false }, crouch: { visible: false } } })
  const { World } = await import("./world/zones")
  const world = new World(game)
  const ready = world.init()
  // Held items: every rod and skin from the items pack; the rod points along -Z from the grip.
  const grip = { rotation: { x: 1.75, y: 0.0, z: -0.15 } }
  const firstPerson = { rotation: { x: -1.1, y: 0, z: 0 } }
  const define = (key: string, model: string) =>
    game.avatars.defineItem(key, {
      model: async () => {
        await ready
        return cloneRoot(model) ?? new (await import("three")).Group()
      },
      grip,
      firstPerson,
      sockets: { tip: { x: 0, y: 0, z: -1.9 } },
    })
  for (const id of ROD_KEYS) define("rod_" + id, "rod_" + id)
  for (const id of SKIN_KEYS) define("rod_skin_" + id, "skin_" + id)
  game.avatars.defineClip("castswing", "punch")
  game.start()
  return { game, world }
}
