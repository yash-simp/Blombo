// "Biggest for its kind" tournament every 20 minutes (same moment in every room), 5 minutes long.
import { SPECIES, tourneyAt, tourneyPrize } from "./rules.ts"
import { type Live, grant, level, live, progress } from "./game.ts"
import { MUSIC, SFX, playFor } from "./sounds.ts"

interface Entry {
  u: string
  n: string
  s: number
  sp: number
  g: number
}

let round = -1
let isLive = false
let board: Entry[] = []
let crown = ""
let dirty = false
let lastSent = 0
const players = new Set<string>()

export function tourneyLive(): boolean {
  return isLive
}

export function crownHolder(): string {
  return crown
}

function send(): void {
  const t = tourneyAt(Date.now())
  api.remotes.sendAll("Tourney", {
    round: t.round,
    live: isLive,
    startsAt: t.startsAt,
    endsAt: t.endsAt,
    board: board.slice(0, 10).map((e) => ({ n: e.n, u: e.u, s: Math.round(e.s * 100), sp: e.sp, g: e.g })),
    crown,
  })
  dirty = false
  lastSent = Date.now()
}

export function sendTourneyTo(userId: string): void {
  const t = tourneyAt(Date.now())
  api.remotes.send(userId, "Tourney", {
    round: t.round,
    live: isLive,
    startsAt: t.startsAt,
    endsAt: t.endsAt,
    board: board.slice(0, 10).map((e) => ({ n: e.n, u: e.u, s: Math.round(e.s * 100), sp: e.sp, g: e.g })),
    crown,
  })
}

export function onTourneyCatch(p: Live, species: number, size: number, grams: number): void {
  if (!isLive) return
  if (!players.has(p.userId)) {
    players.add(p.userId)
    p.save.st.tPlays++
    progress(p, { kind: "tourney" })
  }
  const existing = board.find((e) => e.u === p.userId)
  if (existing && existing.s >= size) return
  if (existing) {
    existing.s = size
    existing.sp = species
    existing.g = grams
    existing.n = p.name
  } else board.push({ u: p.userId, n: p.name, s: size, sp: species, g: grams })
  board.sort((a, b) => b.s - a.s)
  dirty = true
}

function finish(): void {
  isLive = false
  const present = board.filter((e) => live.has(e.u))
  present.forEach((e, place) => {
    const p = live.get(e.u)
    if (!p) return
    const prize = tourneyPrize(place, level(p))
    if (place === 0) {
      p.save.st.tWins++
      crown = e.u
      playFor(p.userId, SFX.win, 90)
    } else playFor(p.userId, SFX.cheer, 80)
    grant(p, "tourney", prize, place + 1)
  })
  if (!present.length) crown = ""
  send()
  try {
    api.sound.setSoundtrack(MUSIC.day, 45)
  } catch {
    /* budget */
  }
}

export function tickTourney(): void {
  const now = Date.now()
  const t = tourneyAt(now)
  if (t.phase === "live" && !isLive) {
    isLive = true
    round = t.round
    board = []
    players.clear()
    send()
    try {
      api.sound.setSoundtrack(MUSIC.tourney, 45)
      api.sound.play(SFX.cheer, 60)
    } catch {
      /* budget */
    }
    return
  }
  if (isLive && (t.phase !== "live" || t.round !== round)) {
    finish()
    return
  }
  if (dirty && now - lastSent > 1000) send()
  void SPECIES
}
