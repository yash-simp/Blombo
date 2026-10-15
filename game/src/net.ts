// The browser's view of the server: state remotes in one reactive store, one-shot events on a bus.
import { reactive } from "vue"
import type { Frozen, IGame, IRemoteStates, IServerToClientRemotePayloads } from "@blombo/game-runtime"
import { setServerClock } from "./sky"

export type MeState = Frozen<IRemoteStates["Me"]>
export type BagState = Frozen<IRemoteStates["Bag"]>
export type DexState = Frozen<IRemoteStates["Dex"]>
export type QuestState = Frozen<IRemoteStates["Quests"]>
export type TourneyState = Frozen<IRemoteStates["Tourney"]>
export type HomesState = Frozen<IRemoteStates["Homes"]>

export const store = reactive({
  me: null as MeState | null,
  bag: null as BagState | null,
  dex: null as DexState | null,
  quests: null as QuestState | null,
  tourney: null as TourneyState | null,
  homes: [] as HomesState,
  online: false,
  userId: "",
})

type Events = IServerToClientRemotePayloads
type Handler<K extends keyof Events> = (payload: Frozen<Events[K]>) => void
const handlers = new Map<string, Set<(payload: unknown) => void>>()

export function on<K extends keyof Events>(name: K, handler: Handler<K>): () => void {
  let set = handlers.get(name)
  if (!set) handlers.set(name, (set = new Set()))
  set.add(handler as (payload: unknown) => void)
  return () => set!.delete(handler as (payload: unknown) => void)
}

/** Subscribe to every state and event. Call right after startGame resolves (events wait for it). */
export function bindNet(game: IGame): () => void {
  const offs = [
    game.remotes.watch("Me", (v) => (store.me = v ?? null)),
    game.remotes.watch("Bag", (v) => (store.bag = v ?? null)),
    game.remotes.watch("Dex", (v) => (store.dex = v ?? null)),
    game.remotes.watch("Quests", (v) => (store.quests = v ?? null)),
    game.remotes.watch("Tourney", (v) => (store.tourney = v ?? null)),
    game.remotes.watch("Homes", (v) => (store.homes = v ?? [])),
    game.remotes.watch("Clock", (v) => {
      if (typeof v === "number") setServerClock(v)
    }),
    game.on("remote", (message) => {
      const set = handlers.get(message.name)
      if (set) for (const h of [...set]) h(message.payload)
    }),
    game.on("connection", () => {
      store.online = game.online
      store.userId = game.localPlayer?.userId ?? store.userId
    }),
  ]
  store.online = game.online
  store.userId = game.localPlayer?.userId ?? ""
  return () => offs.forEach((off) => off())
}
