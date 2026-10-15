import type { ISightStage } from "@blombo/game-runtime/sight"
import { World } from "../world/zones"

/** Draws Lantern Lake as the game does (no players, no server). */
export default async function sight(stage: ISightStage) {
  const world = new World({ t: (key) => key, local: { add: (object) => (stage.add(object), () => {}) } })
  world.drawSea = false
  await world.load(0)
  await world.update(0, 42, 0.016)
}
