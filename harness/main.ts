// Harness entry: pick a scenario from the URL (save, place, time of day), boot the game's real server
// code on the api shim, then mount the game's real App.vue.
import { player, sentLog, states, storage } from "./mock/api"
import { newSave, storageKey } from "../game/server/save.ts"
import { SPECIES, levelOf, skyAt, type Weather } from "../game/server/rules.ts"

const q = new URLSearchParams(location.search)
const harness: Record<string, unknown> = { states, sentLog, missing: new Set<string>() }
;(window as any).__harness = harness
;(window as any).__missing = harness.missing

// Time of day (and weather, when asked): shift the page clock to a moment that matches.
const phase = q.get("phase")
const weather = q.get("weather") as Weather | null
if (phase || weather) {
  const real = Date.now.bind(Date)
  let offset = 0
  for (let step = 0; step < 20_000; step++) {
    const sky = skyAt(real() + offset)
    if ((!phase || sky.phase === phase) && (!weather || sky.weather === weather) && sky.phaseLeftMs > 60_000) break
    offset += 30_000
  }
  Date.now = () => real() + offset
}

// Saves: a brand-new angler, or one a while in.
const save = newSave()
const preset = q.get("save") ?? "new"
if (preset !== "new") {
  const pick = (id: string) => SPECIES.findIndex((s) => s.id === id)
  const lantern = SPECIES.map((s, i) => ({ s, i })).filter((x) => x.s.zone === 0)
  save.tut = 3
  save.coins = preset === "late" ? 182_450 : 1_240
  save.xp = preset === "late" ? 22_000 : 260
  save.rods = preset === "late" ? 0b11111 : 0b11
  save.rod = preset === "late" ? 4 : 1
  save.reel = preset === "late" ? 3 : 1
  save.bag = preset === "late" ? 3 : 1
  save.zones = preset === "late" ? 0b11111 : 0b11
  save.bait = { cricket: 8, shrimp: 3 }
  save.baitEq = ["cricket"]
  save.titles = ["rookie", "angler"]
  save.title = "rookie"
  save.st.catches = preset === "late" ? 820 : 23
  save.st.perfect = preset === "late" ? 214 : 6
  save.st.sold = preset === "late" ? 700 : 15
  save.ach = ["a_first", "a_c50"]
  save.q = preset === "late" ? 24 : 4
  save.qp = 0
  const bag: [string, number, number][] = [
    ["reed_pike", 3100, 0],
    ["pebble_perch", 420, 0],
    ["bubblecarp", 1820, 0],
    ["lily_minnow", 160, 1],
    ["sunspot_bream", 970, 2],
    ["pebble_perch", 380, 0],
  ]
  save.fish = bag.map(([id, g, f], k) => [k + 1, pick(id), g, f])
  save.uid = bag.length + 1
  for (const x of lantern.slice(0, preset === "late" ? 9 : 5)) {
    save.dc[x.i] = 1 + (x.i % 4)
    save.db[x.i] = Math.round(x.s.kg * 1200)
  }
  save.dsh[pick("lily_minnow")] = 1
  save.ir[0] = preset === "late" ? 3 : 1
  save.lclaim = Math.floor(Date.now() / 86_400_000)
  save.streak = 3
  void levelOf
}
storage.set(storageKey(player.userId), save)

// Where the player stands: x, z, yaw (yaw 0 looks toward -Z, the lake).
const PLACES: Record<string, [number, number, number]> = {
  spawn: [0, 42, 0],
  guide: [0, 41, 0],
  pier: [0, -5.5, 0],
  market: [-12, 25.5, 0.3],
  tackle: [12.5, 25.5, -0.3],
  captain: [3, 62, -0.6],
  plaza: [0, 30, Math.PI],
  shore: [-14, 2, -0.4],
}
const at = PLACES[q.get("at") ?? (preset === "new" ? "spawn" : "pier")] ?? PLACES.spawn!
player.x = at[0]
player.z = at[1]
player.yaw = at[2]

await import("../game/server/main.ts")
const { createApp } = await import("vue")
const { default: App } = await import("../game/src/App.vue")
await import("../game/src/styles.css")
const controller = await import("../game/src/fishing/controller")
const net = await import("../game/src/net")
harness.fishUi = controller.fishUi
harness.store = net.store
harness.player = player
createApp(App).mount("#app")
