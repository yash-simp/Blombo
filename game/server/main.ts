// Lantern Lake — the room's Server Script. Rules live in rules.ts; this file wires events to them.
import { createPaid } from "./paid.ts"
import { live, loadPlayer, paidHooks, savePlayer, sendAll, sendMe, sendBag, toast, type Live } from "./game.ts"
import { cast, hook, reel, rehook, resetFishing } from "./fishing.ts"
import { aquarium, assignPlot, releasePlot, sendHomes } from "./homes.ts"
import { buy, claim, equip, heldRod, lock, nearMarket, sell, setting, talk, travel } from "./shop.ts"
import { tickSky } from "./sky.ts"
import { sendTourneyTo, tickTourney } from "./tourney.ts"
import { anchor } from "./world.ts"
import { SFX, playFor } from "./sounds.ts"

// Blogem products (commerce.json). Benefits are questions asked where they apply (paidHooks.owns).
const paid = createPaid({
  products: ["sell_x2", "bait_belt", "vip_boat", "auto_reel", "skin_rainbow", "skin_dragon", "skin_candy", "lucky_bait_3", "sale_boost_1", "rehook_1"],
  use: {
    lucky_bait_3: {
      can: (player) => {
        const p = live.get(player.userId)
        if (!p?.loaded) return "unavailable"
        return p.lucky > Date.now() ? "already_lucky" : true
      },
      apply(player) {
        const p = live.get(player.userId)
        if (!p) return false
        p.lucky = Date.now() + 3 * 60_000
        playFor(p.userId, SFX.sparkle)
        sendMe(p)
      },
    },
    sale_boost_1: {
      can: (player) => {
        const p = live.get(player.userId)
        if (!p?.loaded) return "unavailable"
        if (!p.save.fish.length) return "bag_empty"
        return nearMarket(player) ? true : "go_market"
      },
      apply(player) {
        const p = live.get(player.userId)
        if (!p) return false
        return sell(p, player, { all: true, ids: [] }, 2) > 0
      },
    },
    rehook_1: {
      can: (player) => {
        const p = live.get(player.userId)
        if (!p?.lastEscape || Date.now() - p.lastEscape.at > 45_000) return "too_late"
        return p.fishing.phase === "idle" ? true : "busy_fishing"
      },
      apply(player) {
        const p = live.get(player.userId)
        return p ? rehook(p) : false
      },
    },
  },
  changed(userId) {
    const p = live.get(userId)
    if (p?.loaded) sendMe(p)
  },
})
paidHooks.owns = paid.owns
paidHooks.units = paid.units

api.room.setMaxPlayers(24)

async function join(player: ScriptPlayer): Promise<void> {
  const p = await loadPlayer(player.userId, player.name)
  assignPlot(p)
  const held = heldRod(p)
  api.players.setHeldItem(p.userId, "right", held || null)
  api.remotes.send(p.userId, "Clock", Date.now())
  sendAll(p)
  sendHomes()
  sendTourneyTo(p.userId)
  if (p.save.tut === 0) {
    const spawn = anchor(0, "spawn")
    if (spawn) api.players.teleport(p.userId, spawn.x, spawn.y + 0.1, spawn.z, spawn.yaw)
  }
}

api.on("playerJoin", (player) => {
  void join(player)
})

api.on("playerLeave", async (player) => {
  try {
    if ((await api.players.list()).some((other) => other.userId === player.userId)) return
  } catch {
    return
  }
  const p = live.get(player.userId)
  if (!p) return
  resetFishing(p)
  savePlayer(p)
  live.delete(player.userId)
  releasePlot(player.userId)
  sendHomes()
})

api.on("remote", (player, name, payload) => {
  const p: Live | undefined = live.get(player.userId)
  if (!p?.loaded) return
  switch (name) {
    case "Cast":
      return cast(p, player, payload)
    case "Hook":
      return hook(p, payload)
    case "Reel":
      return reel(p, payload)
    case "CancelCast":
      if (p.fishing.id === payload) resetFishing(p)
      return
    case "Talk":
      return talk(p, player, payload)
    case "Sell":
      sell(p, player, payload)
      return
    case "Buy":
      return buy(p, payload)
    case "Equip":
      return equip(p, payload)
    case "Travel":
      return travel(p, player, payload)
    case "Claim":
      return claim(p, payload)
    case "Aquarium":
      return aquarium(p, payload)
    case "Lock":
      return lock(p, payload)
    case "Setting":
      return setting(p, payload)
  }
})

// Autosave every 10 s, sky every 2 s, tournament every second.
api.setInterval(() => {
  for (const p of live.values()) if (p.dirty) savePlayer(p)
}, 10_000)
api.setInterval(tickSky, 2_000)
api.setInterval(tickTourney, 1_000)
api.later(() => {
  tickSky()
  tickTourney()
})

export { toast, sendBag }
