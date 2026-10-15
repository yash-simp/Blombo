// The shared clock: the server tells each browser its time once; day, night and weather follow from it
// (server/rules.ts skyAt), the same in every room and on every screen.
import { DAY_CYCLE_MS, type Sky, skyAt } from "../server/rules.ts"

let offset = 0
export function setServerClock(serverNow: number): void {
  offset = serverNow - Date.now()
}
export function serverNow(): number {
  return Date.now() + offset
}
export function currentSky(): Sky {
  return skyAt(serverNow())
}

/** 0 by day, 1 at night, smooth through dusk and dawn. */
export function nightFactor(sky = currentSky()): number {
  const phaseLen = sky.phase === "dusk" || sky.phase === "dawn" ? 0.1 * DAY_CYCLE_MS : 1
  const into = 1 - sky.phaseLeftMs / phaseLen
  if (sky.phase === "night") return 1
  if (sky.phase === "day") return 0
  if (sky.phase === "dusk") return Math.min(1, Math.max(0, into))
  return Math.min(1, Math.max(0, 1 - into))
}
