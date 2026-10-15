<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue"
import type { IGame } from "@blombo/game-runtime"
import { Vector3 } from "three"
import { useGameUiScale } from "@/useGameUiScale"
import { t } from "@/text"
import Icon from "./ui/Icon.vue"
import ActionDock from "./ui/ActionDock.vue"
import CatchCard from "./ui/CatchCard.vue"
import Celebrate from "./ui/Celebrate.vue"
import BagCard from "./ui/BagCard.vue"
import ShopCard from "./ui/ShopCard.vue"
import IndexCard from "./ui/IndexCard.vue"
import QuestsCard from "./ui/QuestsCard.vue"
import TravelCard from "./ui/TravelCard.vue"
import ProfileCard from "./ui/ProfileCard.vue"
import RideView from "./ui/RideView.vue"
import { bindNet, on, store } from "./net"
import { fishUi, Fishing } from "./fishing/controller"
import { Beacon } from "./world/beacon"
import type { World } from "./world/zones"
import { BAITS, REELS, RODS, SPECIES, ZONES, levelOf, tourneyAt } from "../server/rules.ts"
import { RARITY_CSS, baitName, clock, fishName, goalText, num, questGoal, shortNum, zoneName } from "./ui/format"
import { currentSky, serverNow } from "./sky"

const viewport = ref<HTMLElement | null>(null)
const uiStyle = useGameUiScale(viewport)
const canvas = ref<HTMLCanvasElement | null>(null)
const touchLayer = ref<HTMLElement | null>(null)
const coinCounter = ref<HTMLElement | null>(null)
const celebrate = ref<InstanceType<typeof Celebrate> | null>(null)
const game = shallowRef<IGame | null>(null)
const world = shallowRef<World | null>(null)
const fishing = shallowRef<Fishing | null>(null)
const state = ref<"starting" | "running" | "connecting" | "closed" | "unavailable">("starting")
const card = ref<"" | "bag" | "shop" | "index" | "quests" | "travel" | "profile">("")
const shopTab = ref("rods")
const loaded = ref(false)
const npcKey = ref("")
const npcName = ref("")
const nearMarket = ref(false)
const nearCaptain = ref(false)
const toast = ref("")
const shownCoins = ref(0)
const now = ref(Date.now())
const feed = ref<{ id: number; text: string; color: string }[]>([])
const ride = ref<{ from: number; to: number; ms: number; boat: number; at: number } | null>(null)
let alive = true
let feedId = 0
const subscriptions: (() => void)[] = []
let toastTimer = 0
let beacon: Beacon | null = null
let talkTried = 0

function say(text: string, ms = 3200): void {
  toast.value = text
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = ""), ms)
}

function releaseGame() {
  for (const unsubscribe of subscriptions.splice(0)) unsubscribe()
  fishing.value?.dispose()
  game.value?.dispose()
  game.value = null
}

// ───────────── derived HUD values ─────────────
const level = computed(() => levelOf(store.me?.xp ?? 0))
const xpPct = computed(() => Math.round((level.value.into / level.value.need) * 100))
const bagFull = computed(() => !!store.bag && store.bag.fish.length >= store.bag.cap)
const tourney = computed(() => {
  now.value
  const t0 = tourneyAt(serverNow())
  return { ...t0, live: store.tourney?.live ?? t0.phase === "live", board: store.tourney?.board ?? [], crown: store.tourney?.crown ?? "" }
})
const sky = computed(() => {
  now.value
  return currentSky()
})

interface Goal {
  text: string
  icon: string
  progress: string
  target: Vector3 | null
  action: (() => void) | null
}
const goal = computed<Goal | null>(() => {
  const me = store.me
  const w = world.value
  if (!me || !w) return null
  const anchor = (name: string) => w.anchor(0, name)
  if (me.tut === 0) return { text: t("goal.talk_guide"), icon: "scroll", progress: "", target: anchor("guide"), action: null }
  if (me.tut === 1) {
    const fc = anchor("firstcast")
    return { text: t("goal.first_cast"), icon: "rod", progress: "", target: fc ? new Vector3(fc.x, 0, fc.z) : null, action: null }
  }
  if (me.giftReady) return { text: t("goal.gift"), icon: "gift", progress: "", target: null, action: () => game.value?.remotes.send("Claim", { kind: "gift", id: 0 }) }
  if (bagFull.value) return { text: t("toast.bag_full"), icon: "bag", progress: "", target: marketTarget(), action: null }
  if (me.loginReady) return { text: t("goal.login"), icon: "gift", progress: "", target: null, action: () => game.value?.remotes.send("Claim", { kind: "login", id: 0 }) }
  const q = store.quests
  if (!q) return null
  const g = questGoal(q.q)
  let target: Vector3 | null = null
  if (g.k === "sell") target = marketTarget()
  else if (g.k === "rod" || g.k === "reel") target = anchor("tackle")
  else if (g.k === "zone") target = anchor("captain")
  else if (g.k === "aquarium") {
    const plot = me.plot >= 0 ? (w.zones.get(0)?.data.anchors.plots as number[][] | undefined)?.[me.plot] : undefined
    if (plot) target = new Vector3(plot[0], 1, plot[2])
  }
  const prog = q.qn > 1 ? t("hud.progress", { n: q.qp, t: q.qn }) : ""
  return { text: goalText(g), icon: "scroll", progress: prog, target, action: () => (card.value = "quests") }
})

function marketTarget(): Vector3 | null {
  const w = world.value
  const p = game.value?.player.position
  if (!w || !p) return null
  const zone = w.nearestZone(p.x, p.z)
  return w.anchor(zone, "market")
}

const arrowAngle = ref(0)
const goalDistance = ref(0)

// ───────────── lifecycle ─────────────
onMounted(async () => {
  if (!canvas.value || !touchLayer.value) return
  try {
    const { startGame } = await import("@/game")
    if (!alive) return
    const started = await startGame(canvas.value, touchLayer.value)
    if (!alive) {
      started.game.dispose()
      return
    }
    const g = started.game
    game.value = g
    world.value = started.world
    subscriptions.push(bindNet(g))
    subscriptions.push(...wireEvents(g))
    const updateConnection = () => {
      state.value = g.session === "online" ? "running" : g.session === "closed" ? "closed" : "connecting"
    }
    subscriptions.push(g.on("connection", updateConnection))
    updateConnection()
    started.world.onZoneLoaded = () => (loaded.value = true)
    await started.world.init()
    if (!alive) return
    const f = new Fishing(g)
    fishing.value = f
    beacon = new Beacon()
    subscriptions.push(g.local.add(beacon.root, () => beacon?.dispose()))
    subscriptions.push(g.on("frame", ({ dt }) => frame(g, dt)))
    const clockTimer = window.setInterval(() => (now.value = Date.now()), 500)
    subscriptions.push(() => window.clearInterval(clockTimer))
  } catch (error) {
    console.error(error)
    releaseGame()
    if (alive) state.value = "unavailable"
  }
})

onBeforeUnmount(() => {
  alive = false
  releaseGame()
})

function frame(g: IGame, dt: number): void {
  const p = g.player.position
  void world.value?.update(p.x, p.z, dt)
  fishing.value?.update(dt)
  const w = world.value
  if (!w) return
  // nearest keeper
  const npc = w.npcNear(p.x, p.z, 5.5)
  npcKey.value = npc?.key ?? ""
  npcName.value = npc ? t(`npc.${npc.key === "market" ? "market" + npc.zone : npc.key}`) : ""
  nearMarket.value = !!w.npcNear(p.x, p.z, 10.5) && ["market", "tackle"].includes(w.npcNear(p.x, p.z, 10.5)!.key)
  nearCaptain.value = w.npcNear(p.x, p.z, 13)?.key === "captain"
  // first minute: Grandpa Reed greets new anglers on his own
  if (store.me?.tut === 0 && npc?.key === "guide" && g.online && performance.now() - talkTried > 3000) {
    talkTried = performance.now()
    npc.wave = 2
    g.remotes.send("Talk", "guide")
    say(t("npc.guide") + ": " + t("npc.say.guide0"), 4000)
  }
  w.setGuideMark((store.me?.tut ?? 1) === 0)
  // the goal arrow and beacon
  const target = goal.value?.target ?? null
  if (target) {
    const dx = target.x - p.x
    const dz = target.z - p.z
    goalDistance.value = Math.hypot(dx, dz)
    // screen-relative: 0 = straight ahead of the camera
    const cam = g.camera.getWorldDirection(new Vector3())
    const camYaw = Math.atan2(cam.x, cam.z)
    arrowAngle.value = Math.atan2(dx, dz) - camYaw
  } else goalDistance.value = 0
  beacon?.set(target, goalDistance.value, performance.now() / 1000)
}

// ───────────── server events → feedback ─────────────
function wireEvents(g: IGame): (() => void)[] {
  return [
    on("Reward", (r) => {
      const lines: string[] = []
      if (r.coins) lines.push(t("reward.coins", { n: num(r.coins) }))
      if (r.bait && r.baitN) lines.push(t("reward.bait", { n: r.baitN, bait: baitName(r.bait) }))
      if (r.title) lines.push(t("reward.title", { title: t("title." + r.title) }))
      if (r.skin) lines.push(t("reward.skin", { skin: t("skin." + r.skin) }))
      const C = celebrate.value
      const center = { x: window.innerWidth / 2, y: window.innerHeight * 0.4 }
      switch (r.k) {
        case "rod":
          if (r.n === 0 && (store.me?.tut ?? 1) <= 1) {
            C?.banner({ title: t("reward.rod"), lines: [], icon: "rod", color: "#ffb52e", big: true })
            C?.confetti(90)
            window.setTimeout(() => say(t("npc.guide") + ": " + t("npc.say.guide1"), 5000), 2300)
          } else C?.banner({ title: t("reward.rod_new"), lines: [t("rod." + (RODS[r.n]?.id ?? "twig"))], icon: "rod", color: "#ffb52e" })
          break
        case "gift":
        case "login":
          C?.banner({ title: r.k === "gift" ? t("reward.gift") : t("reward.login", { n: r.n }), lines, icon: "gift", color: "#ff6fa8", big: true })
          C?.confetti(110)
          break
        case "quest":
          C?.banner({ title: t("reward.quest"), lines, icon: "scroll", color: "#5fdc6a" })
          C?.confetti(60)
          break
        case "daily":
          C?.banner({ title: t("reward.daily"), lines, icon: "star", color: "#5fdc6a" })
          break
        case "index":
          C?.banner({ title: t("reward.index"), lines, icon: "book", color: "#6f8bff" })
          C?.confetti(60)
          break
        case "ach":
          C?.banner({ title: t("reward.ach"), lines, icon: "trophy", color: "#c07aff" })
          break
        case "level":
          C?.banner({ title: t("reward.level", { n: r.n }), lines: [], icon: "level", color: "#4fb0ff", big: true })
          C?.confetti(120)
          break
        case "sale":
          C?.banner({ title: t("reward.sale", { n: r.n }), lines, icon: "coin", color: "#ffb52e" })
          break
        case "tourney":
          C?.banner({ title: t("reward.tourney", { n: r.n }), lines, icon: r.n === 1 ? "crown" : "trophy", color: "#ffb52e", big: r.n === 1 })
          if (r.n <= 3) C?.confetti(100)
          break
        case "zone":
          C?.banner({ title: t("reward.zone"), lines: [zoneName(r.n)], icon: "map", color: "#5fdc6a", big: true })
          C?.confetti(80)
          break
        case "reel":
          C?.banner({ title: t("reward.reel"), lines: [t("reel." + (REELS[r.n]?.id ?? "basic"))], icon: "gear", color: "#4fb0ff" })
          break
        case "bag":
          C?.banner({ title: t("reward.bag", { n: r.n }), lines: [], icon: "bag", color: "#c8843a" })
          break
        case "boat":
          C?.banner({ title: t("reward.boat"), lines: [], icon: "boat", color: "#4fb0ff" })
          break
      }
      if (r.coins) C?.flyCoins(Math.min(14, 4 + Math.round(Math.log2(r.coins + 1))), center, coinCounter.value)
    }),
    on("Caught", (c) => {
      const C = celebrate.value
      const rarity = SPECIES[c.s]?.rarity ?? 0
      if (c.first) {
        C?.banner({ title: t("reward.first"), lines: [fishName(c.s)], icon: "fish", color: "#ffb52e", big: true })
        C?.confetti(150)
      } else if (c.isNew) {
        C?.banner({ title: t("reward.new_species"), lines: [fishName(c.s)], icon: "book", color: RARITY_CSS[rarity]!, big: rarity >= 3 })
        if (rarity >= 2) C?.confetti(70)
      } else if (rarity >= 3 || c.sh) C?.confetti(90)
    }),
    on("Toast", (m) => {
      const params: Record<string, string | number> = { n: m.n }
      say(t(m.k, params))
    }),
    on("CastNo", (reason) => say(t("toast." + reason))),
    on("Escaped", (e) => {
      if (e.r >= 0) say(t("hud.got_away"), 2400)
    }),
    on("Fx", (fx) => {
      if (fx.k !== "catch" || fx.u === store.userId) return
      const rarity = SPECIES[fx.s]?.rarity ?? 0
      if (rarity < 2 && !fx.sh) return
      const name = g.players.find((p) => p.userId === fx.u)?.name ?? "?"
      const text = fx.sh ? t("hud.feed_shiny", { name, fish: fishName(fx.s) }) : t("hud.feed_catch", { name, fish: fishName(fx.s) })
      const id = feedId++
      feed.value = [...feed.value.slice(-3), { id, text, color: RARITY_CSS[rarity]! }]
      window.setTimeout(() => (feed.value = feed.value.filter((f) => f.id !== id)), 7000)
    }),
    on("Ride", (r) => {
      card.value = ""
      ride.value = { ...r, at: performance.now() }
      window.setTimeout(() => (ride.value = null), r.ms + 300)
    }),
  ]
}

// the coin counter counts up toward the real value
watch(
  () => store.me?.coins ?? 0,
  (value, old) => {
    if (value <= (old ?? 0) || !old) {
      shownCoins.value = value
      return
    }
    const from = shownCoins.value
    const start = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / 900)
      shownCoins.value = Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3)))
      if (k < 1) requestAnimationFrame(step)
    }
    window.setTimeout(step, 500)
  },
)

function talk(): void {
  const key = npcKey.value
  const g = game.value
  if (!key || !g) return
  const w = world.value
  const npc = w?.npcNear(g.player.position.x, g.player.position.z, 6)
  if (npc) npc.wave = 1.5
  if (key === "guide") {
    if ((store.me?.tut ?? 0) === 0) g.remotes.send("Talk", "guide")
    say(npcName.value + ": " + t("npc.say.guide"))
    card.value = "quests"
  } else if (key === "market") {
    say(npcName.value + ": " + t("npc.say.market"))
    card.value = "bag"
  } else if (key === "tackle") {
    say(npcName.value + ": " + t("npc.say.tackle"))
    card.value = "shop"
  } else if (key === "captain") {
    say(npcName.value + ": " + t("npc.say.captain"))
    card.value = "travel"
  } else if (key === "host") say(npcName.value + ": " + t("npc.say.host"), 4500)
}

function openCard(name: typeof card.value, tab?: string): void {
  if (tab) shopTab.value = tab
  card.value = card.value === name ? "" : name
}

function closeCatch(): void {
  fishUi.catchCard = null
  fishing.value?.dismissShowcase()
}

const luckyLeft = computed(() => {
  now.value
  return 0
})
const tourneyClock = computed(() => {
  const tt = tourney.value
  if (tt.live) return clock(tt.endsAt - serverNow())
  if (tt.phase === "soon") return clock(tt.startsAt - serverNow())
  return ""
})
const myRank = computed(() => {
  const i = tourney.value.board.findIndex((e) => e.u === store.userId)
  return i >= 0 ? { rank: i + 1, pct: tourney.value.board[i]!.s } : null
})
/** One message at a time: a toast, else the newest catch from someone else, else the live tournament. */
const message = computed<{ text: string; color: string } | null>(() => {
  if (toast.value) return { text: toast.value, color: "#9fe9ff" }
  const f = feed.value[feed.value.length - 1]
  if (f) return { text: f.text, color: f.color }
  const tt = tourney.value
  if (tt.live) {
    const r = myRank.value
    return { text: r ? t("hud.tourney_rank", { rank: r.rank, pct: r.pct, time: clock(tt.endsAt - serverNow()) }) : t("hud.tourney_live", { time: clock(tt.endsAt - serverNow()) }), color: "#ffbf3a" }
  }
  return null
})
const SKY_ICONS: Record<string, string> = { dawn: "sun", day: "sun", dusk: "sunset", night: "moon" }
const WEATHER_ICONS: Record<string, string> = { rain: "rain", fog: "fog", storm: "storm", aurora: "aurora" }
const skyIcon = computed(() => SKY_ICONS[sky.value.phase] ?? "sun")
const weatherIcon = computed(() => WEATHER_ICONS[sky.value.weather] ?? "sun")
void luckyLeft
void BAITS
void ZONES
void shortNum
</script>

<template>
  <main ref="viewport" class="shell">
    <canvas ref="canvas" class="game-canvas" :aria-label="t('game.canvas')"></canvas>
    <div ref="touchLayer" class="touch-layer"></div>

    <div class="ui-layer" :style="uiStyle">
      <template v-if="state === 'running' && store.me">
        <!-- top centre: the goal pill (always visible), then one message line -->
        <div class="ui-group ui-group--top top">
          <button v-if="goal" type="button" class="goal" :class="{ 'goal--action': !!goal.action && (store.me.giftReady || store.me.loginReady) }" @click="goal.action?.()">
            <span v-if="goal.target && goalDistance > 5" class="goal__arrow" :style="{ transform: `rotate(${-arrowAngle}rad)` }"><Icon name="arrow" /></span>
            <Icon v-else :name="goal.icon" class="goal__icon" />
            <span class="goal__text">{{ goal.text }}</span>
            <span v-if="goal.progress" class="goal__prog">{{ goal.progress }}</span>
          </button>
          <p v-if="message" :key="message.text" class="toast" :style="{ '--fc': message.color }">{{ message.text }}</p>
        </div>

        <!-- top left: level and xp, sky, tournament clock -->
        <div class="ui-group ui-group--top-left left">
          <button type="button" class="me" :aria-label="t('hud.profile')" @click="openCard('profile')">
            <span class="me__lvl"><Icon name="level" /><b>{{ level.level }}</b></span>
            <span class="me__bar"><span :style="{ width: xpPct + '%' }"></span></span>
          </button>
          <p class="chip-line" :aria-label="t('hud.weather', { phase: t('phase.' + sky.phase), weather: t('weather.' + sky.weather) })">
            <Icon :name="skyIcon" /><Icon v-if="sky.weather !== 'clear'" :name="weatherIcon" />
          </p>
          <button v-if="tourneyClock" type="button" class="chip-line tourney" :class="{ 'tourney--live': tourney.live }" @click="openCard('quests')">
            <Icon name="trophy" /><span>{{ tourneyClock }}</span>
          </button>
        </div>

        <!-- top right: coins, bag and menu buttons -->
        <div class="ui-group ui-group--top-right right">
          <div ref="coinCounter" class="counter counter--coins"><Icon name="coin" /><span>{{ shortNum(shownCoins) }}</span></div>
          <button type="button" class="counter counter--bag" :class="{ full: bagFull }" :aria-label="t('hud.bag_button')" @click="openCard('bag')">
            <Icon name="fish" /><span>{{ t("hud.bag", { n: store.bag?.fish.length ?? 0, cap: store.bag?.cap ?? 25 }) }}</span>
          </button>
          <div class="menu">
            <button type="button" class="menu__b" :aria-label="t('hud.shop')" @click="openCard('shop')"><Icon name="shop" /></button>
            <button type="button" class="menu__b" :aria-label="t('hud.index')" @click="openCard('index')"><Icon name="book" /></button>
            <button type="button" class="menu__b" :aria-label="t('hud.quests')" @click="openCard('quests')">
              <Icon name="scroll" /><i v-if="store.quests?.d.some((d) => d.done && !d.claimed)" class="dot"></i>
            </button>
            <button type="button" class="menu__b" :aria-label="t('hud.travel')" @click="openCard('travel')"><Icon name="map" /></button>
          </div>
        </div>

        <!-- bottom: the catch card, or fishing controls -->
        <CatchCard v-if="fishUi.catchCard && !card" :key="fishUi.catchCard.uid" :c="fishUi.catchCard" @close="closeCatch" />
        <ActionDock
          v-else-if="game && fishing && !card && !ride"
          :game="game"
          :fishing="fishing"
          :npc-name="npcName"
          :show-cast="store.me.tut >= 1"
          @talk="talk"
          @bait="openCard('shop', 'bait')"
        />

        <BagCard v-if="card === 'bag' && game" :game="game" :near-market="nearMarket" @close="card = ''" />
        <ShopCard v-if="card === 'shop' && game" :game="game" :tab="shopTab" @close="card = ''" />
        <IndexCard v-if="card === 'index'" @close="card = ''" />
        <QuestsCard v-if="card === 'quests' && game" :game="game" @close="card = ''" />
        <TravelCard v-if="card === 'travel' && game" :game="game" :at-dock="nearCaptain" @close="card = ''" />
        <ProfileCard v-if="card === 'profile' && game" :game="game" @close="card = ''" />
        <RideView v-if="ride && game && world" :game="game" :world="world" :ride="ride" />
      </template>

      <Celebrate ref="celebrate" />

      <section v-if="state !== 'running'" class="ui-group ui-group--center card status" role="status">
        <h1>
          {{ state === "starting" ? t("status.starting") : state === "connecting" ? t("status.connecting") : t("status.unavailable") }}
        </h1>
        <div v-if="state !== 'starting'" class="card__content" tabindex="-1" :aria-label="t('status.details')">
          <p v-if="state === 'closed'">{{ t("status.closedHelp") }}</p>
          <p v-else-if="state === 'connecting'">{{ t("status.connectingHelp") }}</p>
          <p v-else-if="state === 'unavailable'">{{ t("status.unavailableHelp") }}</p>
        </div>
      </section>
      <p v-else-if="!loaded" class="ui-group ui-group--center loading">{{ t("status.loading") }}</p>
    </div>
  </main>
</template>

<style scoped>
.top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 560px;
}
.goal {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 560px;
  padding: 8px 24px 8px 12px;
  border: 5px solid #0b1a2a;
  border-radius: 48px;
  background: linear-gradient(#fff6c8, #ffd34d);
  color: #3a2000;
  -webkit-text-stroke: 0;
  font-size: 48px;
  line-height: 1.05;
  text-align: left;
  box-shadow: 0 7px 0 #0b1a2a;
  pointer-events: auto;
  animation: goalIn 0.4s cubic-bezier(0.2, 1.6, 0.4, 1);
}
.goal--action {
  background: linear-gradient(#ffd0ec, #ff6fa8);
  color: #fff;
  -webkit-text-stroke: 0.12em #5a1030;
  animation: wiggle 1.2s ease-in-out infinite;
}
.goal__icon,
.goal__arrow {
  flex: none;
  width: 72px;
  height: 72px;
}
.goal__arrow :deep(.icon) {
  width: 72px;
  height: 72px;
}
.goal__text {
  -webkit-text-stroke: inherit;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.goal__prog {
  flex: none;
  padding: 2px 16px;
  border-radius: 999px;
  background: #3a2000;
  color: #ffe27a;
}
.toast {
  max-width: 560px;
  margin: 0;
  padding: 8px 22px;
  border: 4px solid #0b1a2a;
  border-left: 14px solid var(--fc);
  border-radius: 26px;
  background: rgb(9 27 41 / 90%);
  line-height: 1.1;
  text-align: center;
  animation: goalIn 0.3s ease-out;
}
.left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  width: 240px;
}
.me {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 200px;
  padding: 8px 12px 12px;
  border: 5px solid #0b1a2a;
  border-radius: 34px;
  background: rgb(9 27 41 / 88%);
  color: #fff;
  pointer-events: auto;
}
.me__lvl {
  position: relative;
  width: 104px;
  height: 104px;
}
.me__lvl :deep(.icon) {
  width: 104px;
  height: 104px;
}
.me__lvl b {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding-top: 40px;
  font-size: 48px;
}
.me__bar {
  width: 100%;
  height: 20px;
  border-radius: 10px;
  background: #0b1a2a;
  overflow: hidden;
}
.me__bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #4fb0ff, #9ff0ff);
  transition: width 0.6s;
}
.chip-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 6px 16px 6px 8px;
  border: 4px solid #0b1a2a;
  border-radius: 999px;
  background: rgb(9 27 41 / 82%);
  color: #fff;
}
.chip-line :deep(.icon) {
  width: 60px;
  height: 60px;
}
.tourney {
  pointer-events: auto;
}
.tourney--live {
  background: linear-gradient(#ffcf6a, #e8901a);
  color: #3a2000;
  -webkit-text-stroke: 0;
  animation: wiggle 1.4s ease-in-out infinite;
}
.right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  width: 240px;
}
.counter {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 240px;
  padding: 4px 18px 4px 6px;
  border: 5px solid #0b1a2a;
  border-radius: 999px;
  background: rgb(9 27 41 / 88%);
  color: #fff;
}
.counter :deep(.icon) {
  width: 64px;
  height: 64px;
}
.counter span {
  flex: 1;
  text-align: right;
}
.counter--coins span {
  color: #ffe27a;
}
.counter--bag {
  pointer-events: auto;
}
.counter--bag.full {
  border-color: #ff5f5f;
  animation: wiggle 1s ease-in-out infinite;
}
.menu {
  display: grid;
  grid-template-columns: repeat(2, 112px);
  gap: 12px;
}
.menu__b {
  position: relative;
  width: 112px;
  height: 112px;
  padding: 14px;
  border: 5px solid #0b1a2a;
  border-radius: 30px;
  background: linear-gradient(#ffffff, #cfe0ee);
  box-shadow: 0 7px 0 #0b1a2a;
  pointer-events: auto;
}
.menu__b :deep(.icon) {
  width: 100%;
  height: 100%;
}
.menu__b .dot {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 34px;
  height: 34px;
  border: 4px solid #0b1a2a;
  border-radius: 50%;
  background: #ff3a5a;
}
.status {
  width: 688px;
}
.loading {
  margin: 0;
  padding: 20px 40px;
  border: 5px solid #0b1a2a;
  border-radius: 999px;
  background: rgb(9 27 41 / 88%);
}
@keyframes goalIn {
  from {
    scale: 0.7;
    opacity: 0;
  }
}
@keyframes wiggle {
  0%,
  100% {
    rotate: 0deg;
  }
  25% {
    rotate: -2deg;
  }
  75% {
    rotate: 2deg;
  }
}
</style>
