// A browser stand-in for the game server's script `api`, so the game's real server/ code runs in the
// harness page next to the real client. One player, timers on the page clock, storage in memory.
import remotes from "../../game/remotes.json"

type Handler = (...args: any[]) => unknown
export interface ShimPlayer {
  userId: string
  name: string
  sessionId: string
  x: number
  y: number
  z: number
  yaw: number
}

const STATE = new Set(Object.keys((remotes as { state: Record<string, unknown> }).state))
const handlers = new Map<string, Handler[]>()
export const storage = new Map<string, unknown>()
export const states = new Map<string, unknown>()
const stateWatchers = new Map<string, Set<(v: unknown) => void>>()
const eventListeners = new Set<(message: { name: string; payload: unknown }) => void>()
export const held: Record<string, string | null> = {}
export const sentLog: { name: string; payload: unknown }[] = []

export const player: ShimPlayer = { userId: "u-ann", name: "Ann", sessionId: "s-ann", x: 0, y: 1, z: 42, yaw: 0 }
/** Set by the mock game: moves the visible player (server teleports). */
export const hooks = { teleport: (_x: number, _y: number, _z: number, _yaw: number) => {} }

function deliver(name: string, payload: unknown): void {
  sentLog.push({ name, payload })
  if (STATE.has(name)) {
    states.set(name, payload)
    for (const cb of stateWatchers.get(name) ?? []) cb(payload)
  } else for (const cb of [...eventListeners]) cb({ name, payload })
}

const snapshot = () => ({ ...player, health: 100, spectator: false })

export const api = {
  on(name: string, fn: Handler) {
    const list = handlers.get(name) ?? []
    list.push(fn)
    handlers.set(name, list)
  },
  log: (...a: unknown[]) => console.log("[script]", ...a),
  warn: (...a: unknown[]) => console.warn("[script]", ...a),
  later: (fn: () => void) => window.setTimeout(fn, 0),
  setTimeout: (fn: () => void, ms: number) => window.setTimeout(fn, ms),
  clearTimeout: (id: number) => window.clearTimeout(id),
  setInterval: (fn: () => void, ms: number) => window.setInterval(fn, ms),
  remotes: {
    send: (_userId: string, name: string, payload: unknown) => deliver(name, payload),
    sendAll: (name: string, payload: unknown) => deliver(name, payload),
  },
  storage: {
    get: async (key: string) => structuredClone(storage.get(key) ?? null),
    set: (key: string, value: unknown) => void storage.set(key, structuredClone(value)),
  },
  players: {
    list: async () => [snapshot()],
    get: () => snapshot(),
    setHeldItem: (_u: string, hand: string, item: string | null) => void (held[hand] = item),
    teleport: (_u: string, x: number, y: number, z: number, yaw = 0) => hooks.teleport(x, y, z, yaw),
    setSpawn: () => {},
    playHandClip: () => {},
  },
  sound: { setSoundtrack: () => {}, playForPlayer: () => {}, playAt: () => {}, play: () => {} },
  world: { setSkybox: () => {}, setEnvironment: () => {} },
  room: { setMaxPlayers: () => {} },
  commerce: {
    state: async () => ({ items: [], mode: "test" }),
    consume: async () => {
      throw new Error("not_owned")
    },
    consumption: async () => false,
  },
}

/** The browser side of the remotes. */
export const client = {
  send(name: string, payload: unknown): boolean {
    window.setTimeout(() => {
      for (const fn of handlers.get("remote") ?? []) void fn(snapshot(), name, payload)
    }, 40)
    return true
  },
  watch(name: string, cb: (v: unknown) => void): () => void {
    let set = stateWatchers.get(name)
    if (!set) stateWatchers.set(name, (set = new Set()))
    set.add(cb)
    if (states.has(name)) cb(states.get(name))
    return () => set!.delete(cb)
  },
  onEvent(cb: (message: { name: string; payload: unknown }) => void): () => void {
    eventListeners.add(cb)
    return () => eventListeners.delete(cb)
  },
  async join(): Promise<void> {
    for (const fn of handlers.get("playerJoin") ?? []) await fn(snapshot())
  },
}

;(globalThis as unknown as { api: typeof api }).api = api
