// Player profiles: the saved shape, defaults, loading/saving with api.storage and the state remotes.
import { BAG_SIZES, BAITS, RODS, SPECIES, type Stats, ZONES, dailyFor, utcDay } from "./rules.ts"

export interface Save {
  v: number
  coins: number
  xp: number
  rod: number
  rods: number
  reel: number
  bag: number
  zones: number
  boats: number
  boat: number
  bait: Record<string, number>
  baitEq: string[]
  skin: string
  skins: string[]
  title: string
  titles: string[]
  tut: number
  auto: boolean
  /** [uid, species, grams, flags]; flags: 1 shiny, 2 locked */
  fish: number[][]
  aq: number[][]
  uid: number
  dc: number[]
  db: number[]
  dsh: number[]
  ir: number[]
  st: Stats
  ach: string[]
  q: number
  qp: number
  dday: number
  dids: string[]
  dp: number[]
  dcl: boolean[]
  lday: number
  streak: number
  lclaim: number
  /** ms timestamp until which paid Lucky Bait works */
  luckyUntil: number
}

export const SAVE_VERSION = 1
export const FLAG_SHINY = 1
export const FLAG_LOCKED = 2

export function newStats(): Stats {
  return { catches: 0, perfect: 0, shiny: 0, legend: 0, mythic: 0, night: 0, storm: 0, sold: 0, earned: 0, tWins: 0, tPlays: 0, species: 0, zones: 1 }
}

export function newSave(): Save {
  const n = SPECIES.length
  return {
    v: SAVE_VERSION,
    coins: 0,
    xp: 0,
    rod: 0,
    rods: 1,
    reel: 0,
    bag: 0,
    zones: 1,
    boats: 1,
    boat: 0,
    bait: {},
    baitEq: ["worm"],
    skin: "",
    skins: [],
    title: "",
    titles: [],
    tut: 0,
    auto: false,
    fish: [],
    aq: [],
    uid: 1,
    dc: new Array(n).fill(0),
    db: new Array(n).fill(0),
    dsh: new Array(n).fill(0),
    ir: new Array(ZONES.length).fill(0),
    st: newStats(),
    ach: [],
    q: 0,
    qp: 0,
    dday: 0,
    dids: [],
    dp: [0, 0, 0],
    dcl: [false, false, false],
    lday: 0,
    streak: 0,
    lclaim: 0,
    luckyUntil: 0,
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d)
const arr = <T>(v: unknown, d: T[]): T[] => (Array.isArray(v) ? (v as T[]) : d)

/** Repairs a stored profile: missing fields get defaults, arrays grow with new species and zones. */
export function normalize(raw: unknown): Save {
  const s = newSave()
  if (!isObj(raw)) return s
  for (const key of Object.keys(s) as (keyof Save)[]) {
    if (raw[key] === undefined) continue
    const d = s[key]
    const v = raw[key]
    if (typeof d === "number") (s as unknown as Record<string, unknown>)[key] = num(v, d)
    else if (typeof d === "boolean") (s as unknown as Record<string, unknown>)[key] = v === true
    else if (typeof d === "string") (s as unknown as Record<string, unknown>)[key] = typeof v === "string" ? v : d
    else if (Array.isArray(d)) (s as unknown as Record<string, unknown>)[key] = arr<unknown>(v, d as unknown[])
    else if (isObj(d) && isObj(v)) (s as unknown as Record<string, unknown>)[key] = { ...d, ...v }
  }
  for (const key of ["dc", "db", "dsh"] as const) while (s[key].length < SPECIES.length) s[key].push(0)
  while (s.ir.length < ZONES.length) s.ir.push(0)
  s.rods |= 1
  s.zones |= 1
  s.boats |= 1
  if (!s.baitEq.length) s.baitEq = ["worm"]
  s.rod = Math.min(Math.max(0, s.rod), RODS.length - 1)
  s.bag = Math.min(Math.max(0, s.bag), BAG_SIZES.length - 1)
  return s
}

export function storageKey(userId: string): string {
  return "ll:p:" + userId
}

export function bagCap(s: Save): number {
  return BAG_SIZES[s.bag] ?? 25
}

export function baitCount(s: Save, id: string): number {
  if (id === "worm") return Infinity
  return s.bait[id] ?? 0
}

export function addBait(s: Save, id: string, n: number): void {
  if (id === "worm" || !BAITS.some((b) => b.id === id)) return
  s.bait[id] = (s.bait[id] ?? 0) + n
}

/** Refreshes the daily quests when the UTC day changed. */
export function rollDaily(s: Save, userId: string, now: number): boolean {
  const day = utcDay(now)
  if (s.dday === day && s.dids.length === 3) return false
  s.dday = day
  s.dids = dailyFor(day, userId)
  s.dp = [0, 0, 0]
  s.dcl = [false, false, false]
  return true
}
