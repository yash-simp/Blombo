// The shared rules: fish pools, rarity odds, sizes and prices, levels, sky, tournaments, quests and text.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import {
  ACHIEVEMENTS,
  BAITS,
  BOATS,
  DAILY_POOL,
  FIGHT,
  GUIDE_QUESTS,
  RARITY_DIFFICULTY,
  REELS,
  RODS,
  SKINS,
  SPECIES,
  SPECIES_PER_ZONE,
  ZONES,
  dailyFor,
  fishValue,
  guideQuest,
  levelOf,
  minFightMs,
  mulberry32,
  rollFish,
  rollGrams,
  skyAt,
  speciesBites,
  tapPower,
  tourneyAt,
  xpToNext,
} from "../server/rules.ts"
import { Fight } from "../src/fishing/fight.ts"

const text = JSON.parse(readFileSync("locales/en.json", "utf8")) as Record<string, string>
const DAY = { night: false, weather: "clear" as const }
const NIGHT_AURORA = { night: true, weather: "aurora" as const }

test("every water has its full set of fish, from common to mythic", () => {
  assert.ok(SPECIES.length >= 54)
  assert.equal(new Set(SPECIES.map((s) => s.id)).size, SPECIES.length, "unique ids")
  ZONES.forEach((_, zone) => {
    const fish = SPECIES.filter((s) => s.zone === zone)
    assert.equal(fish.length, SPECIES_PER_ZONE, "zone " + zone)
    for (let r = 0; r <= 5; r++) assert.ok(fish.some((s) => s.rarity === r), `zone ${zone} rarity ${r}`)
  })
})

test("rolled fish always match the water, the time and the weather", () => {
  const rng = mulberry32(7)
  for (const sky of [DAY, NIGHT_AURORA, { night: false, weather: "storm" as const }, { night: true, weather: "fog" as const }]) {
    for (let zone = 0; zone < ZONES.length; zone++) {
      for (let i = 0; i < 400; i++) {
        const f = rollFish({ zone, sky, luck: 0.5, shinyMult: 1, rng })
        if (!f) {
          assert.ok(ZONES[zone]!.nightOnly && !sky.night, "only Moon Pond by day is empty")
          continue
        }
        const s = SPECIES[f.species]!
        assert.equal(s.zone, zone)
        assert.ok(speciesBites(s, sky), `${s.id} in ${JSON.stringify(sky)}`)
      }
    }
  }
  assert.equal(rollFish({ zone: 5, sky: DAY, luck: 0, shinyMult: 1, rng }), null)
  assert.notEqual(rollFish({ zone: 5, sky: NIGHT_AURORA, luck: 0, shinyMult: 1, rng }), null)
})

test("luck makes rare fish more common, and shinies are about 1 in 250", () => {
  const share = (luck: number) => {
    const rng = mulberry32(11)
    let rare = 0
    let shiny = 0
    const n = 20_000
    for (let i = 0; i < n; i++) {
      const f = rollFish({ zone: 0, sky: DAY, luck, shinyMult: 1, rng })!
      if (SPECIES[f.species]!.rarity >= 2) rare++
      if (f.shiny) shiny++
    }
    return { rare: rare / n, shiny: shiny / n }
  }
  const plain = share(0)
  const lucky = share(1.5)
  assert.ok(lucky.rare > plain.rare * 1.3, JSON.stringify({ plain, lucky }))
  assert.ok(plain.shiny > 1 / 500 && plain.shiny < 1 / 125, String(plain.shiny))
})

test("sizes vary around the average and prices rise with rarity, size, water and shine", () => {
  const rng = mulberry32(3)
  const id = 0
  const grams = Array.from({ length: 2000 }, () => rollGrams(id, rng))
  const avg = grams.reduce((a, b) => a + b, 0) / grams.length / 1000
  assert.ok(Math.abs(avg / SPECIES[id]!.kg - 1) < 0.15, String(avg))
  assert.ok(Math.max(...grams) > SPECIES[id]!.kg * 1000 * 1.6, "rare giants exist")
  const g = (i: number) => SPECIES[i]!.kg * 1000
  const byRarity = (zone: number, r: number) => SPECIES.findIndex((s) => s.zone === zone && s.rarity === r)
  for (let r = 1; r <= 5; r++) assert.ok(fishValue(byRarity(0, r), g(byRarity(0, r)), false) > fishValue(byRarity(0, r - 1), g(byRarity(0, r - 1)), false))
  assert.ok(fishValue(byRarity(1, 0), g(byRarity(1, 0)), false) > fishValue(byRarity(0, 0), g(byRarity(0, 0)), false))
  assert.ok(fishValue(id, g(id) * 2, false) > fishValue(id, g(id), false))
  assert.ok(fishValue(id, g(id), true) >= fishValue(id, g(id), false) * 5)
})

test("fights take longer for harder fish and shorter with stronger rods", () => {
  assert.ok(minFightMs(3, 1) > minFightMs(1, 1))
  assert.ok(minFightMs(2, tapPower(RODS.length - 1, 0)) < minFightMs(2, 1))
  assert.ok(minFightMs(2, tapPower(0, REELS.length - 1)) < minFightMs(2, 1), "a better reel taps harder")
  assert.ok(minFightMs(0.6, 1) < 6000, "the first fish is quick")
})

/**
 * Taps a fight at a steady rate from `first` s in (0.3 s: a player's reaction) at 60 fps; rate 0 = only Auto-Reel.
 * jitter: each gap is off by up to ± that share, like a real thumb.
 */
function tapFight(d: number, rate: number, seed: number, power = 1, auto = false, first = 0.3, jitter = 0): Fight {
  const fight = new Fight(d, power, mulberry32(seed))
  const thumb = mulberry32(seed + 1)
  const dt = 1 / 60
  let next = first
  for (let t = 0; !fight.done && t < 90; t += dt) {
    while (rate > 0 && next <= t) {
      fight.tap()
      next += (1 + (thumb() * 2 - 1) * jitter) / rate
    }
    fight.update(dt, auto)
  }
  return fight
}
const SEEDS = Array.from({ length: 24 }, (_, i) => 1000 + i * 37)
function averageTaps(d: number, rate: number, power = 1): number {
  let taps = 0
  for (const seed of SEEDS) {
    const fight = tapFight(d, rate, seed, power)
    assert.equal(fight.done, "caught", `d ${d} at ${rate}/s (seed ${seed})`)
    taps += fight.taps
  }
  return taps / SEEDS.length
}

test("tap to reel: a few taps for common fish, more for rarer ones, at an easy pace", () => {
  // Common, Uncommon, Rare, Epic, Legendary, Mythic at a comfortable pace for each.
  const pace = [2.5, 3, 3.5, 3.5, 4, 4.5]
  const want = [8, 10, 14, 18, 24, 30]
  RARITY_DIFFICULTY.forEach((d, r) => {
    const taps = averageTaps(d, pace[r]!)
    assert.ok(Math.abs(taps - want[r]!) <= want[r]! * 0.25, `rarity ${r}: ${taps.toFixed(1)} taps at ${pace[r]}/s, want about ${want[r]}`)
  })
  // 2 taps a second lands Common and Uncommon, 3 Rare and Epic, 4 Legendary and Mythic.
  const enough = [2, 2, 3, 3, 4, 4]
  RARITY_DIFFICULTY.forEach((d, r) => averageTaps(d, enough[r]!))
  // A giant Mythic (the hardest fish there is) never needs more than 5 a second.
  averageTaps(RARITY_DIFFICULTY[5]! * 1.25, 5)
  // Rarer fish take more taps; a better rod and reel take fewer.
  for (let r = 1; r < RARITY_DIFFICULTY.length; r++) assert.ok(averageTaps(RARITY_DIFFICULTY[r]!, 5) > averageTaps(RARITY_DIFFICULTY[r - 1]!, 5))
  assert.ok(tapFight(2.2, 4, 1, tapPower(5, 3)).taps < tapFight(2.2, 4, 1).taps)
  // The very first fish of a new player (difficulty 0.6) is a handful of slow taps.
  for (const seed of SEEDS) {
    const first = tapFight(0.6, 2, seed)
    assert.equal(first.done, "caught")
    assert.ok(first.taps <= 6, `first fish: ${first.taps} taps`)
  }
  // The fish waits for the first tap (a moment to read the meter), then gets away after a few seconds.
  const reading = new Fight(0.6, 1, mulberry32(3))
  for (let t = 0; t < FIGHT.wait - 0.1; t += 1 / 60) reading.update(1 / 60)
  assert.equal(reading.progress, FIGHT.start)
  const idle = tapFight(1, 0, 1)
  assert.equal(idle.done, "escaped")
  assert.ok(idle.elapsed > FIGHT.wait + 2, "time to notice and start tapping")
})

test("tap to reel: the best rod and reel make fights shorter, never trivial", () => {
  const best = tapPower(RODS.length - 1, REELS.length - 1)
  for (const d of [0.6, ...RARITY_DIFFICULTY]) {
    for (const rate of [3, 5, 10]) assert.ok(tapFight(d, rate, 2, best).taps >= 5, `d ${d} at ${rate}/s: at least five taps`)
  }
  const common = averageTaps(RARITY_DIFFICULTY[0]!, 5, best)
  const mythic = averageTaps(RARITY_DIFFICULTY[5]!, 5, best)
  assert.ok(mythic >= 7 && mythic > common + 1, `best gear: Common ${common.toFixed(1)}, Mythic ${mythic.toFixed(1)} taps`)
  assert.ok(mythic < averageTaps(RARITY_DIFFICULTY[5]!, 5) / 2.5, "still far quicker than with the twig rod")
  // The server's bound means something with any gear: no catch in under 0.3 s.
  for (const d of [0.3, 0.6, ...RARITY_DIFFICULTY]) assert.ok(minFightMs(d, best) >= 300, `d ${d}: ${minFightMs(d, best)} ms`)
})

test("tap to reel: Auto-Reel lands every fish, steady tapping is Perfect, stalling is not", () => {
  for (const d of [0.6, ...RARITY_DIFFICULTY, RARITY_DIFFICULTY[5]! * 1.25]) {
    for (const seed of SEEDS.slice(0, 6)) {
      const fight = tapFight(d, 0, seed, 1, true)
      assert.equal(fight.done, "caught", `auto d ${d}`)
      assert.ok(fight.elapsed < 10, `auto d ${d}: ${fight.elapsed.toFixed(1)} s`)
    }
  }
  assert.ok(tapFight(1, 3, 1).perfect, "a steady 3 taps a second keeps a common fish above the start")
  // Tapping once, then waiting: the meter slips below its start, still landable but not Perfect.
  const fight = new Fight(1, 1, mulberry32(5))
  fight.tap()
  for (let t = 0; t < 2; t += 1 / 60) fight.update(1 / 60)
  for (let t = 0; !fight.done && t < 30; t += 1 / 60) {
    if (Math.round(t * 60) % 15 === 0) fight.tap()
    fight.update(1 / 60)
  }
  assert.equal(fight.done, "caught")
  assert.equal(fight.perfect, false)
})

test("tap to reel: faster tapping never reels slower, auto-clickers gain nothing and the server's bound is exact", () => {
  // A real thumb (gaps ±15%): every tap counts, and past 10 a second the meter fills hardly any faster.
  for (const d of [1, RARITY_DIFFICULTY[5]!]) {
    const seconds = [6, 8, 10, 12, 14, 20].map((rate) => SEEDS.reduce((sum, seed) => sum + tapFight(d, rate, seed, 1, false, 0.3, 0.15).elapsed, 0) / SEEDS.length)
    for (let i = 1; i < seconds.length; i++) assert.ok(seconds[i]! <= seconds[i - 1]! + 0.02, `d ${d}: ${seconds.map((s) => s.toFixed(2)).join(" ")}`)
    assert.ok(seconds.at(-1)! >= seconds[2]! * 0.9, "20 a second is barely quicker than 10")
  }
  for (const d of [0.3, 0.6, 0.74, ...RARITY_DIFFICULTY, RARITY_DIFFICULTY[5]! * 1.25]) {
    for (const power of [1, tapPower(4, 2), tapPower(RODS.length - 1, REELS.length - 1)]) {
      // Tapping from the very first moment: the fastest catch there is.
      const fast = tapFight(d, 2 / FIGHT.tapGap, 7, power, false, 0)
      const spam = tapFight(d, 60, 7, power, false, 0)
      assert.equal(spam.done, "caught")
      assert.ok(Math.abs(spam.elapsed - fast.elapsed) < 0.05, "60 taps a second is no faster than 20")
      // Never quicker than minFightMs, the server's anti-cheat bound, and not slower by more than a tap: the
      // bound is tight, so the server's Perfect check never denies the fastest real tappers.
      const ms = spam.elapsed * 1000
      const min = minFightMs(d, power)
      assert.ok(ms >= min - 1 && ms <= min + FIGHT.tapGap * 1000, `d ${d} power ${power.toFixed(2)}: ${ms.toFixed(0)} ms vs ${min} ms`)
    }
  }
})

test("levels: smooth curve with no wall", () => {
  let total = 0
  for (let level = 1; level < 60; level++) {
    assert.equal(levelOf(total).level, level)
    const step = xpToNext(level)
    assert.ok(step > 0)
    if (level > 3) assert.ok(step / xpToNext(level - 1) < 1.6, "no sudden jump at " + level)
    total += step
  }
})

test("gear, waters and boats get steadily better and dearer", () => {
  for (let i = 1; i < RODS.length; i++) {
    assert.ok(RODS[i]!.power >= RODS[i - 1]!.power && RODS[i]!.coins > RODS[i - 1]!.coins && RODS[i]!.level >= RODS[i - 1]!.level, RODS[i]!.id)
  }
  for (let i = 1; i < REELS.length; i++) assert.ok(REELS[i]!.tap > REELS[i - 1]!.tap)
  for (let i = 1; i < ZONES.length; i++) assert.ok(ZONES[i]!.coinMult > ZONES[i - 1]!.coinMult && ZONES[i]!.level > ZONES[i - 1]!.level)
  for (let i = 1; i < BOATS.length; i++) assert.ok(BOATS[i]!.rideMs < BOATS[i - 1]!.rideMs)
})

test("sky: a full day has every phase, aurora only at night, weather changes", () => {
  const phases = new Set<string>()
  const weathers = new Set<string>()
  for (let t = 0; t < 4 * 60 * 60_000; t += 30_000) {
    const sky = skyAt(t)
    phases.add(sky.phase)
    weathers.add(sky.weather)
    if (sky.weather === "aurora") assert.ok(sky.night)
  }
  assert.deepEqual([...phases].sort(), ["dawn", "day", "dusk", "night"])
  for (const w of ["clear", "rain", "fog", "storm", "aurora"]) assert.ok(weathers.has(w), w)
})

test("tournaments: five minutes live in every twenty, with a warning first", () => {
  let live = 0
  let soon = 0
  const step = 10_000
  for (let t = 0; t < 2 * 60 * 60_000; t += step) {
    const at = tourneyAt(t)
    if (at.phase === "live") {
      live += step
      assert.ok(t >= at.startsAt && t < at.endsAt)
    }
    if (at.phase === "soon") soon += step
  }
  assert.equal(live, 6 * 5 * 60_000)
  assert.equal(soon, 6 * 60_000)
})

test("quests never run out and dailies are three distinct picks", () => {
  for (let n = 0; n < 300; n++) {
    const q = guideQuest(n)
    assert.ok(q.goal && q.reward, "quest " + n)
  }
  assert.ok(GUIDE_QUESTS.length >= 20)
  const ids = dailyFor(20_000, "u1")
  assert.equal(ids.length, 3)
  assert.equal(new Set(ids).size, 3)
  assert.deepEqual(dailyFor(20_000, "u1"), ids, "the same day gives the same dailies")
  for (const id of ids) assert.ok(DAILY_POOL.some((d) => d.id === id))
})

test("every name the game shows has text", () => {
  const missing: string[] = []
  const need = (key: string) => {
    if (!(key in text)) missing.push(key)
  }
  SPECIES.forEach((s) => need("fish." + s.id))
  RODS.forEach((r) => need("rod." + r.id))
  REELS.forEach((r) => need("reel." + r.id))
  BAITS.forEach((b) => {
    need("bait." + b.id)
    need("bait.desc." + b.id)
  })
  BOATS.forEach((b) => need("boat." + b.id))
  SKINS.forEach((s) => need("skin." + s))
  ZONES.forEach((z) => {
    need("zone." + z.key)
    need("zone.desc." + z.key)
    need("title.master_" + z.key)
  })
  ACHIEVEMENTS.forEach((a) => need("title." + a.title))
  for (let r = 0; r <= 5; r++) need("rarity." + r)
  // Literal keys in the client and the server's toasts and refusals.
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name)
      return statSync(full).isDirectory() ? walk(full) : /\.(ts|vue)$/.test(name) ? [full] : []
    })
  for (const file of [...walk("src"), ...walk("server")]) {
    if (file.endsWith("text.ts")) continue
    const source = readFileSync(file, "utf8")
    for (const m of source.matchAll(/\bt\(\s*["']([a-z_]+\.[a-z0-9_.]+)["']/g)) need(m[1]!)
    for (const m of source.matchAll(/toast\(p, ["']([a-z_]+\.[a-z0-9_.]+)["']/g)) need(m[1]!)
    for (const m of source.matchAll(/"CastNo", "([a-z_]+)"/g)) need("toast." + m[1]!)
  }
  assert.deepEqual([...new Set(missing)].filter((k) => !k.endsWith(".") && !k.endsWith("_")), [])
})

test("the Blogem shop sells no random items", () => {
  const commerce = JSON.parse(readFileSync("commerce.json", "utf8")) as { products: { id: string; description?: string }[] }
  for (const p of commerce.products) assert.doesNotMatch(p.id + " " + (p.description ?? ""), /crate|egg|roll|random|mystery|chest|loot/i)
})
