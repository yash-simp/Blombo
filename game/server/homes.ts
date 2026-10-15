// Home docks on the Harbor piers: each player in the room gets one with an aquarium of kept fish.
import { anchorList } from "./world.ts"
import { type Live, checkGuide, live, sendBag, sendMe, sendQuests, toast } from "./game.ts"
import { bagCap } from "./save.ts"
import { SFX, playFor } from "./sounds.ts"

export const AQUARIUM_MAX = 6
const owners: string[] = []

export function plotCount(): number {
  return Math.min(24, anchorList(0, "plots").length)
}

export function assignPlot(p: Live): void {
  if (p.plot >= 0 && owners[p.plot] === p.userId) return
  const n = plotCount()
  for (let i = 0; i < n; i++) {
    if (!owners[i]) {
      owners[i] = p.userId
      p.plot = i
      return
    }
  }
  p.plot = -1
}

export function releasePlot(userId: string): void {
  for (let i = 0; i < owners.length; i++) if (owners[i] === userId) owners[i] = ""
  // a player who joined a full harbour gets the freed plot
  for (const other of live.values()) {
    if (other.userId === userId || other.plot >= 0 || !other.loaded) continue
    assignPlot(other)
    if (other.plot >= 0) sendMe(other)
  }
}

export function sendHomes(): void {
  const list: { p: number; u: string; n: string; t: string; f: number[][] }[] = []
  for (let i = 0; i < owners.length; i++) {
    const u = owners[i]
    if (!u) continue
    const p = live.get(u)
    if (!p) continue
    list.push({ p: i, u, n: p.name, t: p.save.title, f: p.save.aq.slice(0, AQUARIUM_MAX) })
  }
  api.remotes.sendAll("Homes", list)
}

export function aquarium(p: Live, req: { add: number; remove: number }): void {
  const s = p.save
  if (req.add) {
    if (p.plot < 0) return
    if (s.aq.length >= AQUARIUM_MAX) return toast(p, "toast.aquarium_full")
    const i = s.fish.findIndex((f) => f[0] === req.add)
    if (i < 0) return
    s.aq.push(s.fish[i]!)
    s.fish.splice(i, 1)
  }
  if (req.remove) {
    const i = s.aq.findIndex((f) => f[0] === req.remove)
    if (i < 0) return
    if (s.fish.length >= bagCap(s)) return toast(p, "toast.bag_full")
    s.fish.push(s.aq[i]!)
    s.aq.splice(i, 1)
  }
  p.dirty = true
  playFor(p.userId, SFX.pop)
  sendBag(p)
  sendMe(p)
  sendHomes()
  checkGuide(p)
  sendQuests(p)
}
