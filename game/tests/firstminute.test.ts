// The first minute, end to end on the real script runtime: join → Grandpa Reed hands over a rod →
// the guaranteed first cast, bite, hook and reel → FIRST CATCH → welcome gift → sell at the market.
import { test } from "node:test"
import assert from "node:assert/strict"
import { createScriptTest } from "../tools/scriptTest.mjs"
import { FIRST_CATCH_SPECIES, RARITY_DIFFICULTY, REELS, RODS, minFightMs, tapPower } from "../server/rules.ts"

type Me = { coins: number; tut: number; giftReady: boolean; loginReady: boolean; rod: number; rods: number; catches: number; zones: number }
type Bag = { cap: number; fish: number[][] }
type CastOk = { id: number; bite: number; d: number; first: boolean; none: boolean; win: number }
type Caught = { s: number; g: number; first: boolean; isNew: boolean; coins: number; uid: number }
type Reward = { k: string; coins: number; bait: string; baitN: number; n: number }

const TICK = 50
const ticksFor = (ms: number) => Math.ceil(ms / TICK) + 1
/** The end of the lake pier, looking north over the water. */
const PIER = { x: 0, y: 1, z: -6 }

type Room = Awaited<ReturnType<typeof createScriptTest>>
/** Join and wait until the stored profile has loaded (remotes before that are ignored). */
async function joinReady(room: Room, options: { name: string; userId?: string }) {
  const player = await room.join(options)
  await room.tick(2)
  return player
}

async function anchor(room: Awaited<ReturnType<typeof createScriptTest>>, name: string): Promise<{ x: number; y: number; z: number }> {
  const a = await room.run("server/world.ts", (m, n) => m.anchor(0, n), name)
  assert.ok(a, "anchor " + name)
  return a as { x: number; y: number; z: number }
}

/** Cast at a point, wait for the bite, hook, play the fight for its minimum time and land the fish. */
export async function catchOne(room: Awaited<ReturnType<typeof createScriptTest>>, ann: Awaited<ReturnType<Awaited<ReturnType<typeof createScriptTest>>["join"]>>, at = { x: 0, z: -12 }): Promise<Caught> {
  const before = ann.events("CastOk").length
  ann.send("Cast", { x: at.x, z: at.z, p: 0.8 })
  await room.tick(2)
  const casts = ann.events("CastOk") as CastOk[]
  assert.equal(casts.length, before + 1, "CastOk " + JSON.stringify(ann.events("CastNo")) + room.log.join("\n"))
  const c = casts[casts.length - 1]!
  assert.equal(c.none, false)
  await room.tick(ticksFor(c.bite))
  const hooked = ann.events("Hooked").length
  ann.send("Hook", c.id)
  await room.tick(2)
  assert.equal(ann.events("Hooked").length, hooked + 1, "hooked")
  // The fish's real difficulty and the player's gear set the fastest legal fight.
  const f = (await room.run("server/game.ts", (m, id) => {
    const p = m.live.get(id)
    return { d: p.fishing.d, rod: p.save.rod, reel: p.save.reel }
  }, ann.userId)) as { d: number; rod: number; reel: number }
  await room.tick(ticksFor(minFightMs(f.d, tapPower(f.rod, f.reel))))
  const caught = ann.events("Caught").length
  ann.send("Reel", { id: c.id, ok: true, perfect: true })
  await room.tick(2)
  const all = ann.events("Caught") as Caught[]
  assert.equal(all.length, caught + 1, "caught " + room.log.join("\n"))
  return all[all.length - 1]!
}

test("first minute: rod from the guide, a guaranteed first catch, the welcome gift and a sale", async () => {
  const room = await createScriptTest()
  const ann = await room.join({ name: "Ann" })
  await room.tick(2)
  let me = ann.state("Me") as Me
  assert.equal(me.tut, 0, "a new angler starts before the rod")
  assert.equal(me.giftReady, false)
  assert.equal(ann.events("Reward").length, 0, "no popup at join")

  // Casting without a rod is refused with a hint.
  ann.send("Cast", { x: 0, z: -12, p: 1 })
  await room.tick(2)
  assert.equal(ann.events("CastOk").length, 0)

  // The guide stands a few steps from the spawn and hands over the rod.
  const guide = await anchor(room, "guide")
  ann.moveTo(guide.x, guide.y, guide.z + 3)
  await room.tick(1)
  ann.send("Talk", "guide")
  await room.tick(2)
  me = ann.state("Me") as Me
  assert.equal(me.tut, 1, "the rod is given")
  const rodReward = (ann.events("Reward") as Reward[]).find((r) => r.k === "rod")
  assert.ok(rodReward, "the rod is celebrated")

  // The first cast from the lake pier always bites fast and lands the reed pike.
  ann.moveTo(PIER.x, PIER.y, PIER.z)
  await room.tick(1)
  const first = (await catchOne(room, ann)) as Caught
  const cast = (ann.events("CastOk") as CastOk[])[0]!
  assert.equal(cast.first, true)
  assert.ok(cast.bite <= 1500, "the first bite comes quickly")
  assert.ok(cast.win >= 5000, "the first hook window is generous")
  assert.equal(first.first, true)
  assert.equal(first.isNew, true)
  assert.equal(first.s, FIRST_CATCH_SPECIES)
  me = ann.state("Me") as Me
  assert.equal(me.tut, 2)
  assert.equal(me.giftReady, true, "the welcome gift is waiting")
  assert.equal(me.catches, 1)
  const bag = ann.state("Bag") as Bag
  assert.equal(bag.fish.length, 1)
  // The guide's first request (catch a fish) pays out on its own.
  assert.ok((ann.events("Reward") as Reward[]).some((r) => r.k === "quest"), "first quest reward")

  // The welcome gift.
  const coinsBefore = me.coins
  ann.send("Claim", { kind: "gift", id: 0 })
  await room.tick(2)
  me = ann.state("Me") as Me
  assert.equal(me.giftReady, false)
  assert.equal(me.coins, coinsBefore + 100)
  assert.ok((ann.events("Reward") as Reward[]).some((r) => r.k === "gift" && r.bait === "cricket" && r.baitN === 10))

  // Selling away from a market only hints; at the market it pays.
  ann.send("Sell", { all: true, ids: [] })
  await room.tick(2)
  assert.equal((ann.state("Bag") as Bag).fish.length, 1, "no selling in the wild")
  const market = await anchor(room, "market")
  ann.moveTo(market.x, market.y, market.z + 3)
  await room.tick(1)
  const coinsAtMarket = (ann.state("Me") as Me).coins
  ann.send("Sell", { all: true, ids: [] })
  await room.tick(2)
  assert.equal((ann.state("Bag") as Bag).fish.length, 0)
  me = ann.state("Me") as Me
  assert.ok(me.coins > coinsAtMarket, "the sale pays")
  assert.ok((ann.events("Reward") as Reward[]).some((r) => r.k === "sale" && r.n === 1))
  assert.equal(room.status, "running", room.log.join("\n"))
  room.close()
})

test("casting rules: land, out of reach and a too-early hook", async () => {
  const room = await createScriptTest()
  const ann = await joinReady(room, { name: "Ann" })
  await room.run("server/game.ts", (m, id) => {
    const p = m.live.get(id)
    p.save.tut = 3
  }, ann.userId)
  ann.moveTo(PIER.x, PIER.y, PIER.z)
  await room.tick(2)
  const land = (await room.run("server/world.ts", (m, x, z) => {
    for (let r = 4; r < 14; r += 0.5)
      for (let a = 0; a < 6.283; a += 0.2) {
        const px = x + Math.sin(a) * r
        const pz = z + Math.cos(a) * r
        if (!m.nearestWater(0, px, pz, 3)) return { x: px, z: pz }
      }
    return null
  }, PIER.x, PIER.z)) as { x: number; z: number } | null
  assert.ok(land, "dry land near the pier")
  ann.send("Cast", { x: land.x, z: land.z, p: 1 })
  await room.tick(2)
  ann.send("Cast", { x: 0, z: -80, p: 1 })
  await room.tick(2)
  assert.deepEqual(ann.events("CastNo"), ["land", "far"])

  ann.send("Cast", { x: 0, z: -12, p: 1 })
  await room.tick(2)
  const c = (ann.events("CastOk") as CastOk[])[0]!
  assert.equal(c.first, false)
  assert.ok(c.bite >= 1000, "a normal bite takes a moment")
  ann.send("Hook", c.id)
  await room.tick(2)
  assert.equal(ann.events("Hooked").length, 0)
  assert.equal(ann.events("Escaped").length, 1, "striking before the bite spooks the fish")
  room.close()
})

test("reeling faster than the fight allows is rejected", async () => {
  const room = await createScriptTest()
  const ann = await joinReady(room, { name: "Ann" })
  await room.run("server/game.ts", (m, id) => {
    m.live.get(id).save.tut = 3
  }, ann.userId)
  ann.moveTo(PIER.x, PIER.y, PIER.z)
  await room.tick(2)
  ann.send("Cast", { x: 0, z: -12, p: 1 })
  await room.tick(2)
  const c = (ann.events("CastOk") as CastOk[])[0]!
  assert.ok(c.win >= 3000, "a generous strike window")
  // Strike late in the window: still hooked.
  await room.tick(ticksFor(c.bite + c.win - 300))
  ann.send("Hook", c.id)
  await room.tick(2)
  assert.equal(ann.events("Hooked").length, 1)
  // Even a Common on the best rod and reel takes a handful of taps: an instant Reel is impossible.
  const rod = RODS.length - 1
  const reel = REELS.length - 1
  assert.ok(minFightMs(RARITY_DIFFICULTY[0]!, tapPower(rod, reel)) - 100 > 3 * TICK, "the bound is above the test's own delay")
  await room.run("server/game.ts", (m, id, d, best, bestReel) => {
    const p = m.live.get(id)
    p.fishing.d = d
    p.save.rod = best
    p.save.reel = bestReel
  }, ann.userId, RARITY_DIFFICULTY[0], rod, reel)
  ann.send("Reel", { id: c.id, ok: true, perfect: true })
  await room.tick(2)
  assert.equal(ann.events("Caught").length, 0)
  assert.equal(ann.events("Escaped").length, 1)
  room.close()
})

test("tackle shop: level and coins gate a rod; owned rods equip", async () => {
  const room = await createScriptTest()
  const ann = await joinReady(room, { name: "Ann" })
  await room.run("server/game.ts", (m, id) => {
    const p = m.live.get(id)
    p.save.tut = 3
    p.save.coins = 1000
  }, ann.userId)
  await room.tick(1)
  ann.send("Buy", { kind: "rod", id: 1 })
  await room.tick(2)
  assert.equal((ann.state("Me") as Me).rod, 0, "bamboo needs level 2")
  await room.run("server/game.ts", (m, id) => {
    m.live.get(id).save.xp = 60
  }, ann.userId)
  ann.send("Buy", { kind: "rod", id: 1 })
  await room.tick(2)
  let me = ann.state("Me") as Me
  assert.equal(me.rod, 1)
  assert.equal(me.coins, 1000 - RODS[1]!.coins)
  assert.equal((me.rods >> 1) & 1, 1)
  ann.send("Equip", { kind: "rod", id: "twig" })
  await room.tick(2)
  me = ann.state("Me") as Me
  assert.equal(me.rod, 0)
  ann.send("Buy", { kind: "rod", id: 3 })
  await room.tick(2)
  assert.equal((ann.state("Me") as Me).rod, 0, "oak needs level 8")
  room.close()
})

test("unlocking a new water needs its level and coins", async () => {
  const room = await createScriptTest()
  const ann = await joinReady(room, { name: "Ann" })
  await room.run("server/game.ts", (m, id) => {
    const p = m.live.get(id)
    p.save.tut = 3
    p.save.coins = 400
  }, ann.userId)
  ann.send("Buy", { kind: "zone", id: 1 })
  await room.tick(2)
  assert.equal((ann.state("Me") as Me).zones & 2, 0, "level 3 first")
  await room.run("server/game.ts", (m, id) => {
    m.live.get(id).save.xp = 500
  }, ann.userId)
  ann.send("Buy", { kind: "zone", id: 1 })
  await room.tick(2)
  const me = ann.state("Me") as Me
  assert.equal(me.zones & 2, 2)
  assert.equal(me.coins, 0)
  room.close()
})

test("progress is saved and restored", async () => {
  const room = await createScriptTest()
  const ann = await joinReady(room, { name: "Ann", userId: "u-save" })
  await room.run("server/game.ts", (m, id) => {
    const p = m.live.get(id)
    p.save.tut = 3
    p.save.coins = 777
    p.dirty = true
  }, ann.userId)
  await room.tick(1)
  await ann.leave()
  await room.tick(2)
  const again = await room.join({ name: "Ann", userId: "u-save" })
  await room.tick(2)
  const me = again.state("Me") as Me
  assert.equal(me.coins, 777)
  assert.equal(me.tut, 3)
  room.close()
})

test("a full room of 24 anglers stays well inside the tick budget", async () => {
  const room = await createScriptTest()
  const players = []
  for (let i = 0; i < 24; i++) players.push(await room.join({ name: "P" + i }))
  await room.tick(2)
  await room.run("server/game.ts", (m) => {
    for (const p of m.live.values()) p.save.tut = 3
  })
  await room.profile()
  // Everyone fishes along the lake shore for a while.
  for (let round = 0; round < 3; round++) {
    players.forEach((p, i) => {
      p.moveTo(-10 + (i % 12) * 1.8, 1, -6 + Math.floor(i / 12) * 2)
    })
    await room.tick(1)
    players.forEach((p, i) => p.send("Cast", { x: -10 + (i % 12) * 1.8, z: -14, p: 1 }))
    await room.tick(200)
    players.forEach((p) => {
      const c = (p.events("CastOk") as CastOk[]).at(-1)
      if (c) p.send("Hook", c.id)
    })
    await room.tick(100)
  }
  const profile = await room.profile()
  console.log(profile.toString())
  assert.ok(profile.ticks.p95Ms < 10, profile.toString())
  assert.equal(room.status, "running", room.log.join("\n"))
  room.close()
})

test("sailing: a captain takes you to an unlocked water, and its market buys your fish", async () => {
  const room = await createScriptTest()
  const ann = await joinReady(room, { name: "Ann" })
  await room.run("server/game.ts", (m, id) => {
    const p = m.live.get(id)
    p.save.tut = 3
    p.save.zones = 0b11
    p.save.fish = [[1, 0, 400, 0]]
    p.save.uid = 2
  }, ann.userId)
  const captain = await anchor(room, "captain")
  ann.moveTo(captain.x, captain.y, captain.z + 2)
  await room.tick(1)
  ann.send("Travel", 1)
  await room.tick(2)
  const rides = ann.events("Ride") as { from: number; to: number; ms: number }[]
  assert.equal(rides.length, 1, "the ride starts")
  assert.equal(rides[0]!.to, 1)
  await room.tick(ticksFor(rides[0]!.ms) + 2)
  const at = ann.snapshot()
  const willow = (await room.run("server/world.ts", (m) => m.anchor(1, "arrive"))) as { x: number; z: number }
  assert.ok(Math.hypot(at.x - willow.x, at.z - willow.z) < 3, `arrived at Willow River (${at.x}, ${at.z})`)
  assert.equal((ann.state("Me") as Me & { zone: number }).zone, 1)
  const market = (await room.run("server/world.ts", (m) => m.anchor(1, "market"))) as { x: number; y: number; z: number }
  ann.moveTo(market.x, market.y, market.z + 3)
  await room.tick(1)
  ann.send("Sell", { all: true, ids: [] })
  await room.tick(2)
  assert.equal((ann.state("Bag") as Bag).fish.length, 0, "sold at Willow's market")
  // a locked water cannot be sailed to
  const willowCaptain = (await room.run("server/world.ts", (m) => m.anchor(1, "captain"))) as { x: number; y: number; z: number }
  ann.moveTo(willowCaptain.x, willowCaptain.y, willowCaptain.z + 2)
  await room.tick(1)
  ann.send("Travel", 2)
  await room.tick(2)
  assert.equal(ann.events("Ride").length, 1, "Coral Bay is still locked")
  room.close()
})

test("bug fixes: dailies pay out once, recasting is rate-limited, a cast never reveals its fish", async () => {
  const room = await createScriptTest()
  const ann = await joinReady(room, { name: "Ann" })
  await room.run("server/game.ts", (m, id) => {
    const p = m.live.get(id)
    p.save.tut = 3
    p.save.dp[0] = 999
  }, ann.userId)
  const coins0 = (ann.state("Me") as Me).coins
  ann.send("Claim", { kind: "daily", id: 0 })
  await room.tick(2)
  const coins1 = (ann.state("Me") as Me).coins
  assert.ok(coins1 > coins0, "a finished daily pays")
  ann.send("Claim", { kind: "daily", id: 0 })
  await room.tick(2)
  assert.equal((ann.state("Me") as Me).coins, coins1, "and only once")

  ann.moveTo(PIER.x, PIER.y, PIER.z)
  await room.tick(1)
  ann.send("Cast", { x: 0, z: -12, p: 1 })
  await room.tick(2)
  ann.send("Cast", { x: 0, z: -12, p: 1 })
  await room.tick(2)
  assert.equal(ann.events("CastOk").length, 1)
  assert.deepEqual(ann.events("CastNo"), ["too_fast"])
  const c = (ann.events("CastOk") as (CastOk & { r: number })[])[0]!
  assert.equal(c.r, 0, "rarity stays secret until the hook")
  assert.equal(c.d, 1)
  room.close()
})
