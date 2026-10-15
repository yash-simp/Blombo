// Coins in and out: selling at the market, buying gear, equipping, zones and boats, gifts, travel.
import { BAG_COINS, BAITS, BOATS, REELS, RODS, ZONES, fishValue, levelOf, utcDay } from "./rules.ts"
import { FLAG_LOCKED, FLAG_SHINY, addBait, bagCap } from "./save.ts"
import {
  type Live,
  addCoins,
  baitSlots,
  checkAchievements,
  checkGuide,
  grant,
  knownSkin,
  ownedSkins,
  paidHooks,
  progress,
  sendBag,
  sendMe,
  toast,
} from "./game.ts"
import { anchor } from "./world.ts"
import { SFX, playFor } from "./sounds.ts"
import { resetFishing } from "./fishing.ts"
import { sendHomes } from "./homes.ts"

const SELL_RANGE = 11
const CAPTAIN_RANGE = 14

/** True when the player stands near a market keeper (any zone). */
export function nearMarket(player: { x: number; z: number }): boolean {
  for (let z = 0; z < ZONES.length; z++) {
    for (const name of ["market", "tackle"]) {
      const a = anchor(z, name)
      if (a && Math.hypot(a.x - player.x, a.z - player.z) <= SELL_RANGE) return true
    }
  }
  return false
}

export function sell(p: Live, player: { x: number; z: number }, req: { all: boolean; ids: number[] }, mult = 1): number {
  if (!nearMarket(player) && mult === 1) {
    toast(p, "toast.go_market")
    return 0
  }
  const s = p.save
  const ids = new Set(req.ids)
  let total = 0
  let count = 0
  const keep: number[][] = []
  for (const f of s.fish) {
    const locked = ((f[3] ?? 0) & FLAG_LOCKED) !== 0
    const pick = req.all ? !locked : ids.has(f[0]!)
    if (!pick) {
      keep.push(f)
      continue
    }
    total += fishValue(f[1]!, f[2]!, ((f[3] ?? 0) & FLAG_SHINY) !== 0)
    count++
  }
  if (!count) return 0
  s.fish = keep
  const x2 = paidHooks.owns(p.userId, "sell_x2") ? 2 : 1
  total = Math.round(total * x2 * mult)
  s.st.sold += count
  addCoins(p, total)
  playFor(p.userId, SFX.coins)
  api.remotes.send(p.userId, "Reward", { k: "sale", coins: total, bait: "", baitN: 0, xp: 0, title: "", skin: "", n: count })
  progress(p, { kind: "sell", n: count })
  sendBag(p)
  sendMe(p)
  return total
}

function pay(p: Live, coins: number): boolean {
  if (p.save.coins < coins) {
    playFor(p.userId, SFX.error)
    toast(p, "toast.need_coins", coins - Math.floor(p.save.coins))
    return false
  }
  p.save.coins -= coins
  p.dirty = true
  return true
}

function needLevel(p: Live, lvl: number): boolean {
  if (levelOf(p.save.xp).level >= lvl) return true
  playFor(p.userId, SFX.error)
  toast(p, "toast.need_level", lvl)
  return false
}

export function buy(p: Live, req: { kind: "rod" | "reel" | "bait" | "bag" | "zone" | "boat"; id: number }): void {
  const s = p.save
  const i = Math.floor(req.id)
  switch (req.kind) {
    case "rod": {
      const rod = RODS[i]
      if (!rod || (s.rods >> i) & 1) return
      if (!needLevel(p, rod.level) || !pay(p, rod.coins)) return
      s.rods |= 1 << i
      s.rod = i
      api.players.setHeldItem(p.userId, "right", heldRod(p))
      grant(p, "rod", {}, i)
      break
    }
    case "reel": {
      const reel = REELS[i]
      if (!reel || i <= s.reel) return
      if (!needLevel(p, reel.level) || !pay(p, reel.coins)) return
      s.reel = i
      grant(p, "reel", {}, i)
      break
    }
    case "bait": {
      const bait = BAITS[i]
      if (!bait || !bait.coins) return
      if (!pay(p, bait.coins)) return
      addBait(s, bait.id, bait.pack)
      playFor(p.userId, SFX.pop)
      if (!s.baitEq.includes(bait.id)) equipBait(p, bait.id)
      break
    }
    case "bag": {
      if (i !== s.bag + 1 || i >= BAG_COINS.length) return
      if (!pay(p, BAG_COINS[i]!)) return
      s.bag = i
      grant(p, "bag", {}, bagCap(s))
      sendBag(p)
      break
    }
    case "zone": {
      const zone = ZONES[i]
      if (!zone || (s.zones >> i) & 1) return
      if (!needLevel(p, zone.level) || !pay(p, zone.coins)) return
      s.zones |= 1 << i
      grant(p, "zone", {}, i)
      checkAchievements(p)
      break
    }
    case "boat": {
      const boat = BOATS[i]
      if (!boat || boat.paid || (s.boats >> i) & 1) return
      if (!pay(p, boat.coins)) return
      s.boats |= 1 << i
      s.boat = i
      grant(p, "boat", {}, i)
      break
    }
  }
  p.dirty = true
  checkGuide(p)
  sendMe(p)
}

function equipBait(p: Live, id: string): void {
  const s = p.save
  if (id === "worm") {
    s.baitEq = ["worm"]
    return
  }
  if (s.baitEq.includes(id)) {
    s.baitEq = s.baitEq.filter((b) => b !== id)
  } else {
    if ((s.bait[id] ?? 0) <= 0) return
    s.baitEq = s.baitEq.filter((b) => b !== "worm")
    s.baitEq.push(id)
    while (s.baitEq.length > baitSlots(p)) s.baitEq.shift()
  }
  if (!s.baitEq.length) s.baitEq = ["worm"]
}

export function equip(p: Live, req: { kind: "rod" | "bait" | "skin" | "title" | "boat"; id: string }): void {
  const s = p.save
  switch (req.kind) {
    case "rod": {
      const i = RODS.findIndex((r) => r.id === req.id)
      if (i < 0 || !((s.rods >> i) & 1)) return
      s.rod = i
      break
    }
    case "bait":
      equipBait(p, req.id)
      break
    case "skin":
      if (req.id && (!knownSkin(req.id) || !ownedSkins(p).includes(req.id))) return
      s.skin = req.id
      break
    case "title":
      if (req.id && !s.titles.includes(req.id)) return
      s.title = req.id
      sendHomes()
      break
    case "boat": {
      const i = BOATS.findIndex((b) => b.id === req.id)
      const boat = BOATS[i]
      if (!boat) return
      const owned = boat.paid ? paidHooks.owns(p.userId, boat.paid) : ((s.boats >> i) & 1) === 1
      if (!owned) return
      s.boat = i
      break
    }
  }
  p.dirty = true
  if (req.kind === "rod" || req.kind === "skin") api.players.setHeldItem(p.userId, "right", heldRod(p))
  playFor(p.userId, SFX.click, 60)
  sendMe(p)
}

export function heldRod(p: Live): string {
  const s = p.save
  if (s.tut < 1) return ""
  return "rod_" + (s.skin ? "skin_" + s.skin : RODS[s.rod]?.id ?? "twig")
}

export function travel(p: Live, player: { x: number; z: number }, to: number): void {
  const s = p.save
  const now = Date.now()
  const dest = anchor(to, "arrive")
  if (!dest || !((s.zones >> to) & 1) || p.riding > now) return
  let near = false
  for (let z = 0; z < ZONES.length; z++) {
    const a = anchor(z, "captain")
    if (a && Math.hypot(a.x - player.x, a.z - player.z) <= CAPTAIN_RANGE) {
      near = true
      if (z === to) return
      p.zone = z
    }
  }
  if (!near) return toast(p, "toast.go_dock")
  resetFishing(p)
  const boat = BOATS[s.boat] ?? BOATS[0]!
  const ms = boat.rideMs
  p.riding = now + ms
  api.remotes.send(p.userId, "Ride", { from: p.zone, to, ms, boat: s.boat })
  api.setTimeout(() => {
    p.riding = 0
    p.zone = to
    api.players.teleport(p.userId, dest.x, dest.y + 0.1, dest.z, dest.yaw)
    api.players.setSpawn(p.userId, dest.x, dest.y + 0.1, dest.z, dest.yaw)
    sendMe(p)
  }, ms)
}

export function talk(p: Live, player: { x: number; z: number }, npc: string): void {
  const s = p.save
  if (npc === "guide" && s.tut === 0) {
    const a = anchor(0, "guide")
    if (!a || Math.hypot(a.x - player.x, a.z - player.z) > 12) return
    s.tut = 1
    p.dirty = true
    api.players.setHeldItem(p.userId, "right", heldRod(p))
    playFor(p.userId, SFX.gift)
    grant(p, "rod", {}, 0)
    sendMe(p)
  }
}

export function claim(p: Live, req: { kind: "gift" | "quest" | "daily" | "index" | "login"; id: number }): void {
  const s = p.save
  const today = utcDay(Date.now())
  if (req.kind === "gift" && s.tut === 2) {
    s.tut = 3
    playFor(p.userId, SFX.gift)
    grant(p, "gift", { coins: 100, bait: "cricket", baitN: 10 })
    sendMe(p)
  } else if (req.kind === "login" && s.tut >= 3 && s.lclaim < today) {
    s.streak = s.lclaim === today - 1 ? s.streak + 1 : 1
    s.lclaim = today
    const day = Math.min(7, s.streak)
    const lvl = levelOf(s.xp).level
    playFor(p.userId, SFX.gift)
    grant(p, "login", { coins: Math.round((50 + day * 40) * (1 + lvl / 10)), bait: day >= 5 ? "magiclure" : "shrimp", baitN: day >= 5 ? 2 : 5 }, day)
    sendMe(p)
  }
}

export function setting(p: Live, req: { auto: boolean }): void {
  if (req.auto && !paidHooks.owns(p.userId, "auto_reel")) return
  p.save.auto = req.auto
  p.dirty = true
  sendMe(p)
}

export function lock(p: Live, uid: number): void {
  const f = p.save.fish.find((x) => x[0] === uid)
  if (!f) return
  f[3] = (f[3] ?? 0) ^ FLAG_LOCKED
  p.dirty = true
  sendBag(p)
}
