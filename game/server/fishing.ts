// Server authority for casting, hooking and the reel result.
import {
  FIRST_CATCH_SPECIES,
  RODS,
  SPECIES,
  ZONES,
  difficultyOf,
  fishValue,
  fishXp,
  minFightMs,
  rollFish,
  skyAt,
  sizeOf,
  zoneAt,
} from "./rules.ts"
import { FLAG_SHINY, bagCap } from "./save.ts"
import {
  type Live,
  addXp,
  checkAchievements,
  checkIndex,
  luckOf,
  newFishing,
  progress,
  sendBag,
  sendDex,
  sendMe,
  toast,
} from "./game.ts"
import { nearestWater } from "./world.ts"
import { SFX, playAt, playFor } from "./sounds.ts"
import { onTourneyCatch, tourneyLive } from "./tourney.ts"

let castIds = 1
/** Casts closer together than this are refused (no rerolling a fish by recasting). */
const CAST_COOLDOWN_MS = 1200

function fx(p: Live, k: "cast" | "bite" | "reel" | "catch" | "escape" | "idle", x: number, z: number, s = -1, r = 0, sh = false, g = 0): void {
  api.remotes.sendAll("Fx", { u: p.userId, k, x, z, s, r, sh, g })
}

export function resetFishing(p: Live, announce = true): void {
  if (p.fishing.timer) api.clearTimeout(p.fishing.timer)
  const f = p.fishing
  if (announce && f.phase !== "idle") fx(p, "idle", f.x, f.z)
  p.fishing = newFishing()
}

export function cast(p: Live, player: ScriptPlayer, req: { x: number; z: number; p: number }): void {
  const s = p.save
  const now = Date.now()
  if (s.tut < 1) return toast(p, "toast.need_rod")
  if (p.riding > now) return
  if (now - p.lastCastAt < CAST_COOLDOWN_MS) {
    api.remotes.send(p.userId, "CastNo", "too_fast")
    return
  }
  if (p.fishing.phase !== "idle") resetFishing(p)
  if (s.fish.length >= bagCap(s)) {
    playFor(p.userId, SFX.error)
    api.remotes.send(p.userId, "CastNo", "bag_full")
    return
  }
  const zone = zoneAt(player.x, player.z)
  if (zone < 0) return
  if (!((s.zones >> zone) & 1)) {
    api.remotes.send(p.userId, "CastNo", "locked")
    return
  }
  p.zone = zone
  const rod = RODS[s.rod] ?? RODS[0]!
  let x = req.x
  let z = req.z
  const reach = Math.hypot(x - player.x, z - player.z)
  if (!Number.isFinite(reach) || reach > rod.range + 4) {
    api.remotes.send(p.userId, "CastNo", "far")
    return
  }
  const water = nearestWater(zone, x, z, 3)
  if (!water || zoneAt(water.x, water.z) !== zone) {
    playFor(p.userId, SFX.error)
    api.remotes.send(p.userId, "CastNo", "land")
    return
  }
  x = water.x
  z = water.z
  const sky = skyAt(now)
  const first = s.tut === 1
  const { luck, shiny, bite } = luckOf(p, sky.night)
  // Bait: one unit of each equipped bait per cast (worms are free).
  for (const id of s.baitEq) {
    if (id === "worm") continue
    if ((s.bait[id] ?? 0) > 0) s.bait[id] = (s.bait[id] ?? 0) - 1
  }
  s.baitEq = s.baitEq.filter((id) => id === "worm" || (s.bait[id] ?? 0) > 0)
  if (!s.baitEq.length) s.baitEq = ["worm"]
  const rolled = first
    ? { species: FIRST_CATCH_SPECIES, grams: Math.round(SPECIES[FIRST_CATCH_SPECIES]!.kg * 1350), shiny: false }
    : rollFish({ zone, sky, luck, shinyMult: shiny, rng: Math.random })
  const id = castIds++
  p.lastCastAt = now
  const f = p.fishing
  f.id = id
  f.zone = zone
  f.x = x
  f.z = z
  f.first = first
  p.castCount++
  fx(p, "cast", x, z)
  try {
    api.players.playHandClip(p.userId, "castswing", { mask: "rightArm", predicted: true })
  } catch {
    /* clip budget */
  }
  playAt(SFX.cast, player.x, player.y + 1.5, player.z, 70, 20)
  if (!rolled) {
    f.phase = "idle"
    api.remotes.send(p.userId, "CastOk", { id, bite: -1, d: 1, r: 0, first, none: true, win: 0 })
    fx(p, "idle", x, z)
    sendMe(p)
    return
  }
  const rodIndex = s.rod
  const delay = first ? 1400 : Math.round((2500 + Math.random() * 5000) * bite * (1 - rodIndex * 0.02))
  const d = first ? 0.6 : difficultyOf(rolled.species, rolled.grams)
  f.phase = "wait"
  f.species = rolled.species
  f.grams = rolled.grams
  f.shiny = rolled.shiny
  f.d = d
  f.biteAt = now + delay
  f.win = first ? 6000 : 1400 + s.reel * 100
  api.remotes.send(p.userId, "CastOk", { id, bite: delay, d: 1, r: 0, first, none: false, win: f.win })
  f.timer = api.setTimeout(() => {
    if (p.fishing.id !== id || p.fishing.phase !== "wait") return
    playAt(SFX.bite, x, 0.3, z, 90, 25)
    fx(p, "bite", x, z, -1, 0)
  }, delay)
  sendMe(p)
}

export function hook(p: Live, id: number): void {
  const f = p.fishing
  if (f.phase !== "wait" || f.id !== id) return
  const now = Date.now()
  if (now < f.biteAt - 400) {
    // Too early: the fish is spooked.
    fx(p, "escape", f.x, f.z)
    api.remotes.send(p.userId, "Escaped", { id, r: SPECIES[f.species]?.rarity ?? 0, rehook: false })
    resetFishing(p, false)
    return
  }
  if (now > f.biteAt + f.win + 700) {
    escape(p, false)
    return
  }
  f.phase = "hooked"
  f.hookAt = now
  f.auto = p.save.auto
  const rarity = SPECIES[f.species]!.rarity
  api.remotes.send(p.userId, "Hooked", { id, d: f.d, r: rarity })
  fx(p, "reel", f.x, f.z, -1, rarity)
}

function escape(p: Live, canRehook: boolean): void {
  const f = p.fishing
  const rarity = SPECIES[f.species]?.rarity ?? 0
  const rehook = canRehook && rarity >= 2
  if (rehook) p.lastEscape = { species: f.species, grams: f.grams, shiny: f.shiny, d: f.d, at: Date.now(), zone: f.zone }
  api.remotes.send(p.userId, "Escaped", { id: f.id, r: rarity, rehook })
  playAt(SFX.escape, f.x, 0.3, f.z, 70, 20)
  fx(p, "escape", f.x, f.z)
  resetFishing(p, false)
  sendMe(p)
}

export function reel(p: Live, req: { id: number; ok: boolean; perfect: boolean }): void {
  const f = p.fishing
  if (f.phase !== "hooked" || f.id !== req.id) return
  if (!req.ok) return escape(p, true)
  const power = RODS[p.save.rod]?.power ?? 1
  const elapsed = Date.now() - f.hookAt
  if (elapsed < minFightMs(f.d, power) * 0.8 - 500) {
    api.warn("reel too fast", p.userId, elapsed)
    return escape(p, false)
  }
  // Perfect means the fish never left the zone: impossible faster than the minimum fight, never on Auto-Reel
  const perfect = req.perfect && !p.save.auto && !f.auto && elapsed >= minFightMs(f.d, power) * 0.97
  grantCatch(p, f.species, f.grams, f.shiny, perfect, f.first, f.zone, f.x, f.z)
  resetFishing(p, false)
}

/** Restores the last escaped fish into a fight (Re-hook). */
export function rehook(p: Live): boolean {
  const e = p.lastEscape
  if (!e || Date.now() - e.at > 45_000 || p.fishing.phase !== "idle") return false
  const f = p.fishing
  f.id = castIds++
  f.phase = "hooked"
  f.species = e.species
  f.grams = e.grams
  f.shiny = e.shiny
  f.d = e.d
  f.zone = e.zone
  f.hookAt = Date.now()
  f.auto = p.save.auto
  p.lastEscape = null
  api.remotes.send(p.userId, "Hooked", { id: f.id, d: f.d, r: SPECIES[f.species]!.rarity })
  sendMe(p)
  return true
}

export function grantCatch(p: Live, species: number, grams: number, shiny: boolean, perfect: boolean, first: boolean, zone: number, x: number, z: number): void {
  const s = p.save
  const sp = SPECIES[species]!
  const now = Date.now()
  const sky = skyAt(now)
  const uid = s.uid++
  s.fish.push([uid, species, grams, shiny ? FLAG_SHINY : 0])
  const isNew = (s.dc[species] ?? 0) === 0
  s.dc[species] = (s.dc[species] ?? 0) + 1
  s.db[species] = Math.max(s.db[species] ?? 0, grams)
  if (shiny) s.dsh[species] = (s.dsh[species] ?? 0) + 1
  const value = fishValue(species, grams, shiny)
  const xp = fishXp(species, perfect)
  s.st.catches++
  if (perfect) s.st.perfect++
  if (shiny) s.st.shiny++
  if (sp.rarity === 4) s.st.legend++
  if (sp.rarity === 5) s.st.mythic++
  if (sky.night) s.st.night++
  if (sky.weather === "storm") s.st.storm++
  if (first) s.tut = 2
  p.dirty = true
  api.remotes.send(p.userId, "Caught", { s: species, g: grams, sh: shiny, perfect, coins: value, xp, isNew, first, uid })
  playFor(p.userId, sp.rarity >= 4 || shiny ? SFX.legend : sp.rarity >= 2 ? SFX.rare : SFX.catch)
  fx(p, "catch", x, z, species, sp.rarity, shiny, grams)
  addXp(p, xp)
  const live = tourneyLive()
  if (live) onTourneyCatch(p, species, sizeOf(species, grams), grams)
  if (isNew) checkIndex(p, zone)
  checkAchievements(p)
  progress(p, { kind: "catch", c: { zone, rarity: sp.rarity, weather: sky.weather, night: sky.night, perfect, tourney: live } })
  sendBag(p)
  sendDex(p)
  sendMe(p)
  void ZONES
}
