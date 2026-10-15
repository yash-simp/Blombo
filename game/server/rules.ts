// Lantern Lake — pure game data and rules, shared by the Server Script, the browser HUD and the tests.
// No `api` here: everything is deterministic given its inputs (pass `rng` for randomness).

// ───────────────────────────── rarities ─────────────────────────────
export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"] as const
export type Rarity = 0 | 1 | 2 | 3 | 4 | 5
export const RARITY_WEIGHT = [600, 250, 100, 35, 10, 1]
export const RARITY_COINS = [5, 12, 30, 90, 300, 1200]
export const RARITY_XP = [4, 9, 20, 50, 130, 400]
export const RARITY_DIFFICULTY = [1, 1.3, 1.7, 2.2, 2.8, 3.5]
export const RARITY_COLOR = [0xb9c4cf, 0x5fdc6a, 0x3fa7ff, 0xb46bff, 0xffb52e, 0xff4fa3]

// ───────────────────────────── weather and time ─────────────────────────────
export const WEATHERS = ["clear", "rain", "fog", "storm", "aurora"] as const
export type Weather = (typeof WEATHERS)[number]
export type DayPhase = "dawn" | "day" | "dusk" | "night"

export const DAY_CYCLE_MS = 15 * 60_000
export const WEATHER_BLOCK_MS = 4 * 60_000
/** Phase boundaries as fractions of the cycle: dawn 1.5 min, day 7, dusk 1.5, night 5. */
const PHASES: [DayPhase, number][] = [
  ["dawn", 0.1],
  ["day", 0.5667],
  ["dusk", 0.6667],
  ["night", 1],
]

export interface Sky {
  /** 0..1 through the cycle. */
  t: number
  phase: DayPhase
  night: boolean
  weather: Weather
  /** ms until the phase changes and until the weather may change. */
  phaseLeftMs: number
  weatherLeftMs: number
}

function hash32(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

export function skyAt(now: number): Sky {
  const t = (((now % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS) / DAY_CYCLE_MS
  let phase: DayPhase = "night"
  let end = 1
  for (const [name, until] of PHASES) {
    if (t < until) {
      phase = name
      end = until
      break
    }
  }
  const night = phase === "night"
  const block = Math.floor(now / WEATHER_BLOCK_MS)
  const roll = (hash32(block) % 1000) / 1000
  let weather: Weather = roll < 0.5 ? "clear" : roll < 0.7 ? "rain" : roll < 0.82 ? "fog" : roll < 0.92 ? "storm" : "aurora"
  if (weather === "aurora" && !night) weather = "clear"
  return {
    t,
    phase,
    night,
    weather,
    phaseLeftMs: Math.round((end - t) * DAY_CYCLE_MS),
    weatherLeftMs: WEATHER_BLOCK_MS - (((now % WEATHER_BLOCK_MS) + WEATHER_BLOCK_MS) % WEATHER_BLOCK_MS),
  }
}

// ───────────────────────────── zones ─────────────────────────────
export interface Zone {
  key: string
  /** World centre of the island; local layout coordinates are relative to it. */
  x: number
  z: number
  /** Everything within this radius of the centre belongs to the zone. */
  radius: number
  level: number
  coins: number
  coinMult: number
  nightOnly?: boolean
}
export const ZONE_SPACING = 420
export const ZONES: Zone[] = [
  { key: "lantern", x: 0, z: 0, radius: 150, level: 1, coins: 0, coinMult: 1 },
  { key: "willow", x: ZONE_SPACING, z: 0, radius: 150, level: 3, coins: 400, coinMult: 1.8 },
  { key: "coral", x: ZONE_SPACING * 2, z: 0, radius: 150, level: 8, coins: 3_000, coinMult: 3.2 },
  { key: "frost", x: 0, z: ZONE_SPACING, radius: 150, level: 14, coins: 15_000, coinMult: 5.5 },
  { key: "ember", x: ZONE_SPACING, z: ZONE_SPACING, radius: 150, level: 20, coins: 70_000, coinMult: 9 },
  { key: "moon", x: ZONE_SPACING * 2, z: ZONE_SPACING, radius: 150, level: 26, coins: 250_000, coinMult: 14, nightOnly: true },
]
export function zoneAt(x: number, z: number): number {
  for (let i = 0; i < ZONES.length; i++) {
    const zone = ZONES[i]!
    if (Math.hypot(x - zone.x, z - zone.z) <= zone.radius) return i
  }
  return -1
}

// ───────────────────────────── fish ─────────────────────────────
export interface Species {
  id: string
  zone: number
  rarity: Rarity
  /** Average weight in kg. */
  kg: number
  time?: "day" | "night"
  weather?: Weather
}
const S = (id: string, zone: number, rarity: Rarity, kg: number, extra: Partial<Species> = {}): Species => ({
  id,
  zone,
  rarity,
  kg,
  ...extra,
})
export const SPECIES: Species[] = [
  // Lantern Lake
  S("pebble_perch", 0, 0, 0.4),
  S("lily_minnow", 0, 0, 0.15),
  S("bubblecarp", 0, 0, 1.6),
  S("reed_pike", 0, 1, 2.5),
  S("sunspot_bream", 0, 1, 0.9, { time: "day" }),
  S("lantern_catfish", 0, 2, 4.5, { time: "night" }),
  S("ribbon_trout", 0, 3, 2.2, { weather: "rain" }),
  S("elder_koi", 0, 4, 9),
  S("lantern_eel", 0, 5, 3, { time: "night" }),
  // Willow River
  S("river_dace", 1, 0, 0.3),
  S("stream_chub", 1, 0, 0.8),
  S("mud_loach", 1, 0, 0.2),
  S("willow_trout", 1, 1, 1.4),
  S("copper_bass", 1, 1, 2),
  S("shadow_gar", 1, 2, 5, { weather: "fog" }),
  S("thunder_barbel", 1, 3, 6, { weather: "storm" }),
  S("golden_salmon", 1, 4, 8, { time: "day" }),
  S("mossback_turtle", 1, 5, 20, { weather: "rain" }),
  // Coral Bay
  S("sand_snapper", 2, 0, 1.2),
  S("polka_puffer", 2, 0, 0.6),
  S("candy_wrasse", 2, 0, 0.4),
  S("coral_grouper", 2, 1, 6),
  S("glass_flyingfish", 2, 1, 0.8, { time: "day" }),
  S("sapphire_tang", 2, 2, 0.7),
  S("tiger_ray", 2, 3, 12),
  S("sunfin_marlin", 2, 4, 60, { time: "day" }),
  S("prism_seadragon", 2, 5, 4, { time: "night" }),
  // Frost Lake
  S("icefin_smelt", 3, 0, 0.2),
  S("snow_char", 3, 0, 1.5),
  S("frost_perch", 3, 0, 0.6),
  S("glacier_pike", 3, 1, 4),
  S("polar_grayling", 3, 1, 1.2),
  S("blizzard_burbot", 3, 2, 3, { weather: "storm" }),
  S("aurora_trout", 3, 3, 3.5, { weather: "aurora" }),
  S("mammoth_sturgeon", 3, 4, 80),
  S("crystal_koi", 3, 5, 7, { weather: "aurora" }),
  // Ember Lagoon
  S("cinder_minnow", 4, 0, 0.2),
  S("ash_carp", 4, 0, 2.2),
  S("ember_goby", 4, 0, 0.3),
  S("magma_eel", 4, 1, 3),
  S("obsidian_piranha", 4, 1, 1),
  S("lava_lionfish", 4, 2, 1.5),
  S("blaze_arowana", 4, 3, 6, { time: "night" }),
  S("ancient_embercanth", 4, 4, 40),
  S("phoenix_fin", 4, 5, 9, { weather: "storm" }),
  // Moon Pond (the whole zone bites only at night)
  S("moon_minnow", 5, 0, 0.2),
  S("star_guppy", 5, 0, 0.1),
  S("dusk_bream", 5, 0, 1),
  S("nebula_betta", 5, 1, 0.3),
  S("comet_koi", 5, 1, 3),
  S("ghost_catfish", 5, 2, 6),
  S("eclipse_angelfish", 5, 3, 1.2, { weather: "fog" }),
  S("moonlit_sovereign", 5, 4, 50),
  S("starlit_axolotl", 5, 5, 2),
]
export const SPECIES_BY_ID = new Map(SPECIES.map((s, i) => [s.id, i]))
export const FIRST_CATCH_SPECIES = SPECIES_BY_ID.get("reed_pike")!
export const SPECIES_PER_ZONE = 9

export function speciesBites(s: Species, sky: Pick<Sky, "night" | "weather">): boolean {
  if (ZONES[s.zone]?.nightOnly && !sky.night) return false
  if (s.time === "day" && sky.night) return false
  if (s.time === "night" && !sky.night) return false
  if (s.weather && s.weather !== sky.weather) return false
  return true
}

// ───────────────────────────── gear ─────────────────────────────
export interface Rod {
  id: string
  power: number
  luck: number
  range: number
  coins: number
  level: number
}
export const RODS: Rod[] = [
  { id: "twig", power: 1, luck: 0, range: 14, coins: 0, level: 1 },
  { id: "bamboo", power: 1.15, luck: 0.1, range: 16, coins: 250, level: 2 },
  { id: "willow", power: 1.3, luck: 0.2, range: 17, coins: 900, level: 5 },
  { id: "oak", power: 1.45, luck: 0.3, range: 18, coins: 2_600, level: 8 },
  { id: "carbon", power: 1.65, luck: 0.45, range: 20, coins: 7_500, level: 12 },
  { id: "coral", power: 1.85, luck: 0.6, range: 21, coins: 18_000, level: 16 },
  { id: "frost", power: 2.1, luck: 0.8, range: 22, coins: 45_000, level: 21 },
  { id: "magma", power: 2.4, luck: 1, range: 23, coins: 110_000, level: 27 },
  { id: "moon", power: 2.75, luck: 1.25, range: 24, coins: 260_000, level: 34 },
  { id: "star", power: 3.2, luck: 1.6, range: 26, coins: 650_000, level: 44 },
]
export interface Reel {
  id: string
  /** Tap power: multiplies how far each tap fills the catch meter (with the rod's power). */
  tap: number
  coins: number
  level: number
}
export const REELS: Reel[] = [
  { id: "basic", tap: 1, coins: 0, level: 1 },
  { id: "smooth", tap: 1.07, coins: 600, level: 3 },
  { id: "pro", tap: 1.13, coins: 4_000, level: 9 },
  { id: "glide", tap: 1.19, coins: 20_000, level: 16 },
  { id: "tidal", tap: 1.25, coins: 90_000, level: 25 },
  { id: "celestial", tap: 1.3, coins: 400_000, level: 38 },
]
export interface Bait {
  id: string
  /** Coins for one pack of `pack` units; 0 = not sold for coins. */
  coins: number
  pack: number
  /** Multiplies the time until a bite. */
  bite: number
  luck: number
  /** Extra luck at night (Glow Grub). */
  nightLuck: number
  shiny: number
}
export const BAITS: Bait[] = [
  { id: "worm", coins: 0, pack: 0, bite: 1, luck: 0, nightLuck: 0, shiny: 1 },
  { id: "cricket", coins: 40, pack: 10, bite: 0.65, luck: 0, nightLuck: 0, shiny: 1 },
  { id: "shrimp", coins: 150, pack: 10, bite: 1, luck: 0.3, nightLuck: 0, shiny: 1 },
  { id: "glowgrub", coins: 400, pack: 10, bite: 1, luck: 0.2, nightLuck: 0.3, shiny: 1 },
  { id: "magiclure", coins: 1_500, pack: 5, bite: 0.8, luck: 0.8, nightLuck: 0, shiny: 1 },
  { id: "golden", coins: 5_000, pack: 3, bite: 1, luck: 1.2, nightLuck: 0, shiny: 3 },
  { id: "lucky", coins: 0, pack: 3, bite: 1, luck: 1, nightLuck: 0, shiny: 2 },
]
export const BAIT_BY_ID = new Map(BAITS.map((b) => [b.id, b]))
export const BAG_SIZES = [25, 40, 60, 90, 130, 180, 250]
export const BAG_COINS = [0, 500, 3_000, 15_000, 60_000, 200_000, 600_000]
export interface Boat {
  id: string
  coins: number
  rideMs: number
  /** Only granted by a Blogem product. */
  paid?: string
}
export const BOATS: Boat[] = [
  { id: "rowboat", coins: 0, rideMs: 7_000 },
  { id: "sailboat", coins: 5_000, rideMs: 5_000 },
  { id: "steamer", coins: 40_000, rideMs: 4_000 },
  { id: "yacht", coins: 0, rideMs: 2_500, paid: "vip_boat" },
]
/** Cosmetic rod skins: earned by completing a zone's Fish Index, or bought with Blogems. */
export const SKINS = [
  "lantern",
  "willow",
  "coral",
  "frost",
  "ember",
  "moon",
  "rainbow",
  "dragon",
  "candy",
] as const
export const PAID_SKINS: Record<string, string> = { rainbow: "skin_rainbow", dragon: "skin_dragon", candy: "skin_candy" }

// ───────────────────────────── catching ─────────────────────────────
export type Rng = () => number

export interface RollContext {
  zone: number
  sky: Pick<Sky, "night" | "weather">
  luck: number
  shinyMult: number
  rng: Rng
}
export interface RolledFish {
  species: number
  /** grams */
  grams: number
  shiny: boolean
}

export function rarityFactor(rarity: number, luck: number): number {
  return RARITY_WEIGHT[rarity]! * (1 + (luck * rarity) / 2)
}

/** The fish that bites, or null when nothing bites here now (Moon Pond by day). */
export function rollFish(ctx: RollContext): RolledFish | null {
  const pool: { i: number; w: number }[] = []
  let total = 0
  for (let i = 0; i < SPECIES.length; i++) {
    const s = SPECIES[i]!
    if (s.zone !== ctx.zone || !speciesBites(s, ctx.sky)) continue
    // Conditioned fish get a little boost so a rare weather feels special.
    const w = rarityFactor(s.rarity, ctx.luck) * (s.weather || s.time ? 1.6 : 1)
    pool.push({ i, w })
    total += w
  }
  if (!pool.length) return null
  let pick = ctx.rng() * total
  let species = pool[pool.length - 1]!.i
  for (const entry of pool) {
    pick -= entry.w
    if (pick <= 0) {
      species = entry.i
      break
    }
  }
  return { species, grams: rollGrams(species, ctx.rng), shiny: ctx.rng() < SHINY_BASE * ctx.shinyMult }
}
export const SHINY_BASE = 1 / 250

function gauss(rng: Rng): number {
  const u = Math.max(1e-9, rng())
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
export function rollGrams(species: number, rng: Rng): number {
  const avg = SPECIES[species]!.kg
  let size = Math.exp(gauss(rng) * 0.28)
  size = Math.min(2.6, Math.max(0.45, size))
  if (rng() < 0.03) size = Math.min(3.2, size * (1.6 + rng() * 0.8))
  return Math.max(10, Math.round(avg * size * 1000))
}
/** Size against the species average, 1 = average. */
export function sizeOf(species: number, grams: number): number {
  return grams / 1000 / SPECIES[species]!.kg
}
export function fishValue(species: number, grams: number, shiny: boolean): number {
  const s = SPECIES[species]!
  const size = Math.min(3.2, sizeOf(species, grams))
  const v = RARITY_COINS[s.rarity]! * ZONES[s.zone]!.coinMult * (0.6 + 0.4 * size) * (shiny ? 6 : 1)
  return Math.max(1, Math.round(v))
}
export function fishXp(species: number, perfect: boolean): number {
  const s = SPECIES[species]!
  return Math.round(RARITY_XP[s.rarity]! * (1 + 0.35 * s.zone) * (perfect ? 1.5 : 1))
}
export function difficultyOf(species: number, grams: number): number {
  const s = SPECIES[species]!
  const size = Math.max(0.3, sizeOf(species, grams))
  return Math.round(RARITY_DIFFICULTY[s.rarity]! * (1 + 0.15 * Math.log2(size)) * 100) / 100
}

// ───────────────────────────── the reel fight (played in the browser, bounded on the server) ──────
// Tap to reel: every tap fills the catch meter, the fish pulls it down all the time (harder during short
// surges). Full = caught, empty = escaped. Taps per rarity at an easy pace: about 8, 10, 14, 18, 24, 30.
export const FIGHT = {
  /** Where the catch meter starts (0..1). */
  start: 0.32,
  /** Meter per tap: gain × power / d^gainExp (power = tapPower of the rod and reel), at most maxTap. */
  gain: 0.13,
  gainExp: 0.74,
  /** Rod power counts as power^rodExp: top gear makes fights shorter, never trivial. */
  rodExp: 0.5,
  /** (1 - start) / 4: whatever the gear, a catch takes at least five taps (and the server's bound stays meaningful). */
  maxTap: 0.17,
  /** Meter lost per second: pull × d^pullExp, × surgeMult while the fish surges. */
  pull: 0.105,
  pullExp: 0.05,
  /** The fish only starts pulling at the first tap, or after this many seconds (time to see the meter). */
  wait: 1.5,
  /** A surge every surgeEvery × (0.7..1.3) s, lasting surgeTime s. */
  surgeEvery: 3.2,
  surgeTime: 0.6,
  surgeMult: 2,
  /** The meter fills at most one full tap per tapGap s: a quicker tap is worth its share (auto-clickers gain nothing). */
  tapGap: 0.1,
  /** Auto-Reel taps this many times a second: enough for any fish, never perfect. */
  autoRate: 6,
  /** Perfect: the meter never drops below its start after the first grace seconds. */
  grace: 1,
}
/** What gear adds to each tap: rod power^rodExp × reel tap power. */
export function tapPower(rod: number, reel: number): number {
  return Math.pow(RODS[rod]?.power ?? 1, FIGHT.rodExp) * (REELS[reel]?.tap ?? 1)
}
export function tapGain(d: number, power: number): number {
  return Math.min(FIGHT.maxTap, (FIGHT.gain * power) / Math.pow(Math.max(0.3, d), FIGHT.gainExp))
}
export function pullRate(d: number): number {
  return FIGHT.pull * Math.pow(Math.max(0.3, d), FIGHT.pullExp)
}
/**
 * The fastest possible fight: one full tap at once, then the meter filling at its cap (one tap per tapGap)
 * against the fish's steady pull. Tap-rate and frame timing can only make a real fight slower.
 */
export function minFightMs(d: number, power: number): number {
  const gain = tapGain(d, power)
  const s = (1 - FIGHT.start - gain) / Math.max(1e-6, gain / FIGHT.tapGap - pullRate(d))
  return Math.floor(Math.max(0, s) * 1000)
}

// ───────────────────────────── levels ─────────────────────────────
export function xpToNext(level: number): number {
  return Math.round(30 * Math.pow(level, 1.5))
}
export function levelOf(totalXp: number): { level: number; into: number; need: number } {
  let level = 1
  let left = Math.max(0, Math.floor(totalXp))
  while (level < 999 && left >= xpToNext(level)) {
    left -= xpToNext(level)
    level++
  }
  return { level, into: left, need: xpToNext(level) }
}

// ───────────────────────────── quests ─────────────────────────────
export type Goal =
  | { k: "talk" }
  | { k: "catch"; n: number; zone?: number; rarity?: number }
  | { k: "sell"; n: number }
  | { k: "rod"; i: number }
  | { k: "reel"; i: number }
  | { k: "index"; n: number }
  | { k: "level"; n: number }
  | { k: "zone"; i: number }
  | { k: "perfect"; n: number }
  | { k: "weather"; w: Weather }
  | { k: "night"; n: number }
  | { k: "aquarium"; n: number }
  | { k: "tourney" }
  | { k: "indexZone" }
  | { k: "visit"; i: number }

export interface Reward {
  coins?: number
  bait?: string
  baitN?: number
  xp?: number
  title?: string
  skin?: string
}
export interface Quest {
  id: string
  goal: Goal
  reward: Reward
}
export const GUIDE_QUESTS: Quest[] = [
  { id: "q_first", goal: { k: "catch", n: 1 }, reward: { coins: 25 } },
  { id: "q_sell", goal: { k: "sell", n: 1 }, reward: { coins: 20 } },
  { id: "q_five", goal: { k: "catch", n: 5 }, reward: { bait: "cricket", baitN: 10 } },
  { id: "q_bamboo", goal: { k: "rod", i: 1 }, reward: { coins: 100 } },
  { id: "q_uncommon", goal: { k: "catch", n: 1, rarity: 1 }, reward: { coins: 60 } },
  { id: "q_index5", goal: { k: "index", n: 5 }, reward: { bait: "shrimp", baitN: 5 } },
  { id: "q_level3", goal: { k: "level", n: 3 }, reward: { coins: 150 } },
  { id: "q_willow", goal: { k: "zone", i: 1 }, reward: { coins: 200 } },
  { id: "q_willow10", goal: { k: "catch", n: 10, zone: 1 }, reward: { bait: "shrimp", baitN: 10 } },
  { id: "q_perfect5", goal: { k: "perfect", n: 5 }, reward: { coins: 300 } },
  { id: "q_rain", goal: { k: "weather", w: "rain" }, reward: { bait: "glowgrub", baitN: 5 } },
  { id: "q_aquarium", goal: { k: "aquarium", n: 1 }, reward: { coins: 250 } },
  { id: "q_rare", goal: { k: "catch", n: 1, rarity: 2 }, reward: { coins: 400 } },
  { id: "q_tourney", goal: { k: "tourney" }, reward: { coins: 500 } },
  { id: "q_coral", goal: { k: "zone", i: 2 }, reward: { coins: 800 } },
  { id: "q_coral25", goal: { k: "catch", n: 25, zone: 2 }, reward: { bait: "magiclure", baitN: 3 } },
  { id: "q_night", goal: { k: "night", n: 3 }, reward: { coins: 1_000 } },
  { id: "q_reel", goal: { k: "reel", i: 2 }, reward: { coins: 1_200 } },
  { id: "q_epic", goal: { k: "catch", n: 1, rarity: 3 }, reward: { coins: 2_000 } },
  { id: "q_frost", goal: { k: "zone", i: 3 }, reward: { coins: 3_000 } },
  { id: "q_frost20", goal: { k: "catch", n: 20, zone: 3 }, reward: { bait: "golden", baitN: 1 } },
  { id: "q_ember", goal: { k: "zone", i: 4 }, reward: { coins: 8_000 } },
  { id: "q_legend", goal: { k: "catch", n: 1, rarity: 4 }, reward: { coins: 15_000 } },
  { id: "q_moon", goal: { k: "zone", i: 5 }, reward: { coins: 30_000 } },
  { id: "q_moon1", goal: { k: "catch", n: 1, zone: 5 }, reward: { bait: "golden", baitN: 2 } },
  { id: "q_indexzone", goal: { k: "indexZone" }, reward: { coins: 50_000 } },
  { id: "q_mythic", goal: { k: "catch", n: 1, rarity: 5 }, reward: { coins: 100_000, title: "mythhunter" } },
]
/** After the chain: endless requests, generated from their number. */
export function endlessQuest(n: number): Quest {
  const zone = n % ZONES.length
  const rarity = Math.min(3, Math.floor(n / 6))
  const count = 3 + (n % 4) * 2
  return {
    id: "q_endless_" + n,
    goal: rarity > 0 ? { k: "catch", n: Math.max(1, Math.round(count / (rarity + 1))), zone, rarity } : { k: "catch", n: count, zone },
    reward: { coins: Math.round(400 * ZONES[zone]!.coinMult * (1 + n * 0.15)), bait: n % 3 === 2 ? "magiclure" : "shrimp", baitN: 3 },
  }
}
export function guideQuest(n: number): Quest {
  return GUIDE_QUESTS[n] ?? endlessQuest(n - GUIDE_QUESTS.length)
}

export interface DailyDef {
  id: string
  goal: Goal
  coins: number
  bait: string
  baitN: number
}
export const DAILY_POOL: DailyDef[] = [
  { id: "d_catch15", goal: { k: "catch", n: 15 }, coins: 150, bait: "shrimp", baitN: 5 },
  { id: "d_catch30", goal: { k: "catch", n: 30 }, coins: 300, bait: "cricket", baitN: 10 },
  { id: "d_uncommon", goal: { k: "catch", n: 4, rarity: 1 }, coins: 200, bait: "shrimp", baitN: 5 },
  { id: "d_rare", goal: { k: "catch", n: 1, rarity: 2 }, coins: 300, bait: "glowgrub", baitN: 5 },
  { id: "d_perfect", goal: { k: "perfect", n: 5 }, coins: 250, bait: "cricket", baitN: 10 },
  { id: "d_sell", goal: { k: "sell", n: 20 }, coins: 200, bait: "shrimp", baitN: 5 },
  { id: "d_night", goal: { k: "night", n: 3 }, coins: 250, bait: "glowgrub", baitN: 5 },
  { id: "d_tourney", goal: { k: "tourney" }, coins: 300, bait: "magiclure", baitN: 1 },
]
/** Three dailies for this UTC day, the same in every room. */
export function dailyFor(day: number, userId: string): string[] {
  let seed = day * 7919
  for (let i = 0; i < userId.length; i++) seed = (seed * 31 + userId.charCodeAt(i)) | 0
  const ids = DAILY_POOL.map((d) => d.id)
  const out: string[] = []
  let h = hash32(seed)
  while (out.length < 3) {
    const id = ids[h % ids.length]!
    if (!out.includes(id)) out.push(id)
    h = hash32(h + 1)
  }
  return out
}
/** Daily rewards grow with level so they stay worth it. */
export function dailyScale(level: number): number {
  return 1 + level / 5
}

// ───────────────────────────── index rewards and achievements ─────────────────────────────
export const INDEX_TIERS = [3, 6, 9]
export function indexReward(zone: number, tier: number): Reward {
  const m = ZONES[zone]!.coinMult
  if (tier === 0) return { coins: Math.round(100 * m) }
  if (tier === 1) return { coins: Math.round(300 * m), bait: "magiclure", baitN: 2 }
  return { coins: Math.round(1_000 * m), skin: SKINS[zone]!, title: "master_" + ZONES[zone]!.key }
}

export interface Achievement {
  id: string
  stat: keyof Stats
  n: number
  title: string
}
export interface Stats {
  catches: number
  perfect: number
  shiny: number
  legend: number
  mythic: number
  night: number
  storm: number
  sold: number
  earned: number
  tWins: number
  tPlays: number
  species: number
  zones: number
}
export const ACHIEVEMENTS: Achievement[] = [
  { id: "a_first", stat: "catches", n: 1, title: "rookie" },
  { id: "a_c50", stat: "catches", n: 50, title: "angler" },
  { id: "a_c500", stat: "catches", n: 500, title: "seasoned" },
  { id: "a_c2000", stat: "catches", n: 2_000, title: "master" },
  { id: "a_p25", stat: "perfect", n: 25, title: "steady" },
  { id: "a_p250", stat: "perfect", n: 250, title: "perfectionist" },
  { id: "a_sh1", stat: "shiny", n: 1, title: "shinyspotter" },
  { id: "a_sh10", stat: "shiny", n: 10, title: "shinyhunter" },
  { id: "a_leg1", stat: "legend", n: 1, title: "legendseeker" },
  { id: "a_myth1", stat: "mythic", n: 1, title: "mythmaker" },
  { id: "a_night100", stat: "night", n: 100, title: "nightowl" },
  { id: "a_storm25", stat: "storm", n: 25, title: "stormchaser" },
  { id: "a_t1", stat: "tWins", n: 1, title: "champion" },
  { id: "a_t10", stat: "tWins", n: 10, title: "grandchampion" },
  { id: "a_sp27", stat: "species", n: 27, title: "naturalist" },
  { id: "a_sp54", stat: "species", n: 54, title: "lorekeeper" },
  { id: "a_z6", stat: "zones", n: 6, title: "worldangler" },
  { id: "a_rich", stat: "earned", n: 1_000_000, title: "tycoon" },
]

// ───────────────────────────── tournaments ─────────────────────────────
export const TOURNEY_PERIOD_MS = 20 * 60_000
export const TOURNEY_LENGTH_MS = 5 * 60_000
export const TOURNEY_WARN_MS = 60_000
/** Tournaments start 10 minutes into each 20-minute block, the same moment in every room. */
export const TOURNEY_OFFSET_MS = 10 * 60_000
export function tourneyAt(now: number): { phase: "idle" | "soon" | "live"; startsAt: number; endsAt: number; round: number } {
  const round = Math.floor((now - TOURNEY_OFFSET_MS) / TOURNEY_PERIOD_MS)
  const startsAt = round * TOURNEY_PERIOD_MS + TOURNEY_OFFSET_MS
  const endsAt = startsAt + TOURNEY_LENGTH_MS
  if (now >= startsAt && now < endsAt) return { phase: "live", startsAt, endsAt, round }
  const next = startsAt + TOURNEY_PERIOD_MS
  return { phase: next - now <= TOURNEY_WARN_MS ? "soon" : "idle", startsAt: next, endsAt: next + TOURNEY_LENGTH_MS, round: round + 1 }
}
export function tourneyPrize(place: number, level: number): Reward {
  const scale = 1 + level / 5
  if (place === 0) return { coins: Math.round(300 * scale), bait: "golden", baitN: 1 }
  if (place === 1) return { coins: Math.round(150 * scale), bait: "magiclure", baitN: 2 }
  if (place === 2) return { coins: Math.round(80 * scale), bait: "shrimp", baitN: 5 }
  return { bait: "cricket", baitN: 5 }
}

// ───────────────────────────── helpers ─────────────────────────────
export function utcDay(now: number): number {
  return Math.floor(now / 86_400_000)
}
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
