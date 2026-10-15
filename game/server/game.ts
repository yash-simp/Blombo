// The room's players: loaded profiles, state remotes, rewards, progress and achievements.
import {
  ACHIEVEMENTS,
  BAITS,
  DAILY_POOL,
  GUIDE_QUESTS,
  INDEX_TIERS,
  PAID_SKINS,
  REELS,
  RODS,
  type Goal,
  type Reward,
  SKINS,
  SPECIES,
  SPECIES_PER_ZONE,
  type Weather,
  ZONES,
  dailyScale,
  guideQuest,
  indexReward,
  levelOf,
  utcDay,
} from "./rules.ts"
import { type Save, addBait, bagCap, normalize, newSave, rollDaily, storageKey } from "./save.ts"
import { SFX, playFor } from "./sounds.ts"

export interface Fishing {
  phase: "idle" | "wait" | "hooked"
  id: number
  species: number
  grams: number
  shiny: boolean
  d: number
  zone: number
  x: number
  z: number
  biteAt: number
  win: number
  hookAt: number
  first: boolean
  timer: number
  /** Auto-Reel was on when the fish was hooked (such catches are never Perfect). */
  auto: boolean
}

export interface Live {
  userId: string
  name: string
  save: Save
  loaded: boolean
  dirty: boolean
  fishing: Fishing
  /** ms timestamp until which the player rides a boat */
  riding: number
  /** The stored profile could not be read: play on, but never overwrite it. */
  readOnly: boolean
  zone: number
  plot: number
  lastEscape: { species: number; grams: number; shiny: boolean; d: number; at: number; zone: number } | null
  castCount: number
  /** When the last cast was accepted (casts are rate-limited). */
  lastCastAt: number
}

export const live = new Map<string, Live>()

/** Paid ownership hook, wired by main.ts (createPaid). */
export const paidHooks = {
  owns: (_userId: string, _id: string) => false,
  units: (_userId: string, _id: string) => 0,
}

export function newFishing(): Fishing {
  return { phase: "idle", id: 0, species: -1, grams: 0, shiny: false, d: 1, zone: 0, x: 0, z: 0, biteAt: 0, win: 0, hookAt: 0, first: false, timer: 0, auto: false }
}

export async function loadPlayer(userId: string, name: string): Promise<Live> {
  let p = live.get(userId)
  if (p) {
    p.name = name
    return p
  }
  p = {
    userId,
    name,
    save: newSave(),
    loaded: false,
    dirty: false,
    fishing: newFishing(),
    riding: 0,
    readOnly: false,
    zone: 0,
    plot: -1,
    lastEscape: null,
    castCount: 0,
    lastCastAt: 0,
  }
  live.set(userId, p)
  let raw: unknown = null
  let ok = false
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    try {
      raw = await api.storage.get(storageKey(userId))
      ok = true
    } catch (error) {
      api.warn("profile load failed", attempt, String(error))
    }
  }
  p.save = ok ? normalize(raw) : newSave()
  p.readOnly = !ok
  p.loaded = true
  const now = Date.now()
  if (rollDaily(p.save, userId, now)) p.dirty = true
  return p
}

export function savePlayer(p: Live): void {
  if (!p.loaded || p.readOnly) return
  try {
    api.storage.set(storageKey(p.userId), p.save)
    p.dirty = false
  } catch (error) {
    api.warn("profile save failed", String(error))
  }
}

export function level(p: Live): number {
  return levelOf(p.save.xp).level
}

/** Luck from the rod, bait, Lucky Bait and the VIP boat. */
export function luckOf(p: Live, night: boolean): { luck: number; shiny: number; bite: number } {
  const s = p.save
  let luck = RODS[s.rod]?.luck ?? 0
  let shiny = 1
  let bite = 1
  for (const id of s.baitEq) {
    const b = BAITS.find((x) => x.id === id)
    if (!b) continue
    if (id !== "worm" && (s.bait[id] ?? 0) <= 0) continue
    luck += b.luck + (night ? b.nightLuck : 0)
    shiny *= b.shiny
    bite *= b.bite
  }
  if (p.save.luckyUntil > Date.now()) {
    luck += 1
    shiny *= 2
  }
  if (paidHooks.owns(p.userId, "vip_boat")) luck += 0.1
  return { luck, shiny, bite }
}

export function baitSlots(p: Live): number {
  return paidHooks.owns(p.userId, "bait_belt") ? 3 : 1
}

export function ownedSkins(p: Live): string[] {
  const list = [...p.save.skins]
  for (const [skin, product] of Object.entries(PAID_SKINS)) if (paidHooks.owns(p.userId, product) && !list.includes(skin)) list.push(skin)
  return list
}

// ───────────────────────────── state remotes ─────────────────────────────
export function sendMe(p: Live): void {
  const s = p.save
  const today = utcDay(Date.now())
  api.remotes.send(p.userId, "Me", {
    coins: Math.floor(s.coins),
    xp: Math.floor(s.xp),
    rod: s.rod,
    rods: s.rods,
    reel: s.reel,
    bag: s.bag,
    zones: s.zones,
    boats: s.boats,
    boat: s.boat,
    bait: Object.entries(s.bait)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => ({ id, n })),
    baitEq: s.baitEq,
    skin: s.skin,
    skins: ownedSkins(p),
    title: s.title,
    titles: s.titles,
    tut: s.tut,
    auto: s.auto && paidHooks.owns(p.userId, "auto_reel"),
    plot: p.plot,
    zone: p.zone,
    sold: s.st.sold,
    catches: s.st.catches,
    perfect: s.st.perfect,
    streak: s.streak,
    loginReady: s.tut >= 3 && s.lclaim < today,
    giftReady: s.tut === 2,
    rehook: p.lastEscape && Date.now() - p.lastEscape.at < 45_000 ? p.lastEscape.species : -1,
    lucky: Math.max(0, Math.ceil((p.save.luckyUntil - Date.now()) / 1000)),
  })
}

export function sendBag(p: Live): void {
  api.remotes.send(p.userId, "Bag", { cap: bagCap(p.save), fish: p.save.fish })
}

export function sendDex(p: Live): void {
  api.remotes.send(p.userId, "Dex", { c: p.save.dc, b: p.save.db, sh: p.save.dsh, ir: p.save.ir })
}

export function sendQuests(p: Live): void {
  const s = p.save
  const q = guideQuest(s.q)
  api.remotes.send(p.userId, "Quests", {
    q: s.q,
    qp: questProgress(p, q.goal),
    qn: goalTarget(q.goal),
    qdone: false,
    day: s.dday,
    d: s.dids.map((id, i) => {
      const def = DAILY_POOL.find((d) => d.id === id)
      const n = def ? goalTarget(def.goal) : 1
      const prog = Math.min(n, s.dp[i] ?? 0)
      return { id, p: prog, n, done: prog >= n, claimed: s.dcl[i] === true }
    }),
    ach: s.ach,
  })
}

export function sendAll(p: Live): void {
  sendMe(p)
  sendBag(p)
  sendDex(p)
  sendQuests(p)
}

// ───────────────────────────── rewards ─────────────────────────────
export function toast(p: Live, k: string, n = 0): void {
  api.remotes.send(p.userId, "Toast", { k, n })
}

/** Grants a reward and shows its celebration. */
export function grant(p: Live, k: string, r: Reward, n = 0): void {
  const s = p.save
  const coins = Math.round(r.coins ?? 0)
  if (coins) addCoins(p, coins)
  if (r.bait && r.baitN) addBait(s, r.bait, r.baitN)
  if (r.xp) addXp(p, r.xp)
  if (r.title && !s.titles.includes(r.title)) {
    s.titles.push(r.title)
    if (!s.title) s.title = r.title
  }
  if (r.skin && !s.skins.includes(r.skin)) s.skins.push(r.skin)
  p.dirty = true
  api.remotes.send(p.userId, "Reward", {
    k,
    coins,
    bait: r.bait ?? "",
    baitN: r.baitN ?? 0,
    xp: r.xp ?? 0,
    title: r.title ?? "",
    skin: r.skin ?? "",
    n,
  })
}

export function addCoins(p: Live, coins: number): void {
  p.save.coins += coins
  if (coins > 0) {
    p.save.st.earned += coins
    checkAchievements(p)
  }
  p.dirty = true
}

export function addXp(p: Live, xp: number): void {
  const before = levelOf(p.save.xp).level
  p.save.xp += xp
  const after = levelOf(p.save.xp).level
  p.dirty = true
  if (after > before) {
    playFor(p.userId, SFX.levelUp)
    api.remotes.send(p.userId, "Reward", { k: "level", coins: 0, bait: "", baitN: 0, xp: 0, title: "", skin: "", n: after })
    checkGuide(p)
  }
}

// ───────────────────────────── quests ─────────────────────────────
export function goalTarget(goal: Goal): number {
  switch (goal.k) {
    case "catch":
    case "sell":
    case "perfect":
    case "night":
    case "index":
    case "level":
    case "aquarium":
      return goal.n
    default:
      return 1
  }
}

function speciesCount(s: Save, zone = -1): number {
  let n = 0
  for (let i = 0; i < SPECIES.length; i++) if ((s.dc[i] ?? 0) > 0 && (zone < 0 || SPECIES[i]!.zone === zone)) n++
  return n
}

/** Progress toward a goal: counters for event goals, the live value for state goals. */
export function questProgress(p: Live, goal: Goal): number {
  const s = p.save
  switch (goal.k) {
    case "rod":
      return (s.rods >> goal.i) > 0 ? 1 : 0
    case "reel":
      return s.reel >= goal.i ? 1 : 0
    case "index":
      return Math.min(goal.n, speciesCount(s))
    case "level":
      return Math.min(goal.n, levelOf(s.xp).level)
    case "zone":
      return (s.zones >> goal.i) & 1
    case "aquarium":
      return Math.min(goal.n, s.aq.length)
    case "indexZone":
      return ZONES.some((_, z) => speciesCount(s, z) >= SPECIES_PER_ZONE) ? 1 : 0
    default:
      return Math.min(goalTarget(goal), s.qp)
  }
}

export interface CatchEvent {
  zone: number
  rarity: number
  weather: Weather
  night: boolean
  perfect: boolean
  tourney: boolean
}

function eventMatches(goal: Goal, ev: { kind: "catch"; c: CatchEvent } | { kind: "sell"; n: number } | { kind: "tourney" }): number {
  if (ev.kind === "sell") return goal.k === "sell" ? ev.n : 0
  if (ev.kind === "tourney") return goal.k === "tourney" ? 1 : 0
  const c = ev.c
  switch (goal.k) {
    case "catch":
      if (goal.zone !== undefined && goal.zone !== c.zone) return 0
      if (goal.rarity !== undefined && c.rarity < goal.rarity) return 0
      return 1
    case "perfect":
      return c.perfect ? 1 : 0
    case "night":
      return c.night ? 1 : 0
    case "weather":
      return c.weather === goal.w ? 1 : 0
    case "tourney":
      return c.tourney ? 1 : 0
    default:
      return 0
  }
}

/** Applies an event to the guide quest and the dailies, then completes what is done. */
export function progress(p: Live, ev: { kind: "catch"; c: CatchEvent } | { kind: "sell"; n: number } | { kind: "tourney" }): void {
  const s = p.save
  const q = guideQuest(s.q)
  const add = eventMatches(q.goal, ev)
  if (add) s.qp += add
  for (let i = 0; i < s.dids.length; i++) {
    const def = DAILY_POOL.find((d) => d.id === s.dids[i])
    if (!def) continue
    const a = eventMatches(def.goal, ev)
    if (a) s.dp[i] = (s.dp[i] ?? 0) + a
  }
  p.dirty = true
  checkGuide(p)
  sendQuests(p)
}

/** Completes the guide quest (repeatedly, in case several are already met) with a celebration. */
export function checkGuide(p: Live): void {
  const s = p.save
  for (let guard = 0; guard < 5; guard++) {
    const q = guideQuest(s.q)
    if (questProgress(p, q.goal) < goalTarget(q.goal)) break
    s.q += 1
    s.qp = 0
    playFor(p.userId, SFX.quest)
    grant(p, "quest", q.reward, s.q)
  }
  sendQuests(p)
}

export function claimDaily(p: Live, index: number): void {
  const s = p.save
  const def = DAILY_POOL.find((d) => d.id === s.dids[index])
  if (!def || s.dcl[index]) return
  if ((s.dp[index] ?? 0) < goalTarget(def.goal)) return
  s.dcl[index] = true
  const scale = dailyScale(levelOf(s.xp).level)
  playFor(p.userId, SFX.quest)
  grant(p, "daily", { coins: Math.round(def.coins * scale), bait: def.bait, baitN: def.baitN }, index)
  sendQuests(p)
  sendMe(p)
}

/** Index rewards for a zone after a new species. */
export function checkIndex(p: Live, zone: number): void {
  const s = p.save
  const count = speciesCount(s, zone)
  while ((s.ir[zone] ?? 0) < INDEX_TIERS.length && count >= INDEX_TIERS[s.ir[zone] ?? 0]!) {
    const tier = s.ir[zone] ?? 0
    s.ir[zone] = tier + 1
    playFor(p.userId, SFX.quest)
    grant(p, "index", indexReward(zone, tier), zone * 10 + tier)
  }
  s.st.species = speciesCount(s)
}

export function checkAchievements(p: Live): void {
  const s = p.save
  s.st.zones = 0
  for (let z = 0; z < ZONES.length; z++) if ((s.zones >> z) & 1) s.st.zones++
  for (const a of ACHIEVEMENTS) {
    if (s.ach.includes(a.id)) continue
    if ((s.st[a.stat] ?? 0) < a.n) continue
    s.ach.push(a.id)
    grant(p, "ach", { title: a.title }, ACHIEVEMENTS.indexOf(a))
  }
}

export function knownSkin(skin: string): boolean {
  return (SKINS as readonly string[]).includes(skin)
}
export function reelZone(p: Live): number {
  return REELS[p.save.reel]?.zone ?? 0.22
}
export { GUIDE_QUESTS }
