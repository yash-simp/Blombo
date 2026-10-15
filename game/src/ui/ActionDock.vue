<script setup lang="ts">
// Bottom centre: the hint, the tap meter during a fight, the big action button (cast / hook / tap), the
// bait chip, the small Reel in chip while waiting and the talk button near a keeper. Keys: E acts, Q talks.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import type { IGame } from "@blombo/game-runtime"
import { t } from "@/text"
import Icon from "./Icon.vue"
import { fishUi, type Fishing } from "../fishing/controller"
import { store } from "../net"
import { FIGHT } from "../../server/rules.ts"
import { RARITY_CSS, baitName } from "./format"

const props = defineProps<{ game: IGame; fishing: Fishing; npcName: string; showCast: boolean; offer?: { label: string; icon: string; run: () => void } | null }>()
const emit = defineEmits<{ talk: []; bait: [] }>()

const actionButton = ref<HTMLButtonElement | null>(null)
const talkButton = ref<HTMLButtonElement | null>(null)
const meter = ref<HTMLElement | null>(null)
const offs: (() => void)[] = []

onMounted(() => {
  if (actionButton.value)
    offs.push(
      props.game.bindAction({
        code: "KeyE",
        button: actionButton.value,
        onActivate: () => props.fishing.press(),
        onRelease: () => props.fishing.release(),
        onCancel: () => props.fishing.cancel(),
      }),
    )
  if (talkButton.value) offs.push(props.game.bindAction({ code: "KeyQ", button: talkButton.value, onActivate: () => emit("talk") }))
})
onBeforeUnmount(() => offs.forEach((off) => off()))

const label = computed(() => {
  switch (fishUi.phase) {
    case "charging":
      return t("hud.cast")
    case "flying":
    case "waiting":
      return t("hud.waiting")
    case "bite":
      return t("hud.hook")
    case "reeling":
      return t("hud.tap")
    case "landing":
      return t("hud.wait")
    default:
      return t("hud.cast")
  }
})
const ringStyle = computed(() => {
  const p = fishUi.phase === "charging" ? fishUi.power : fishUi.phase === "reeling" ? (fishUi.fight?.progress ?? 0) : 0
  return { "--p": String(p) }
})
const bait = computed(() => {
  const eq = store.me?.baitEq ?? ["worm"]
  return eq.map((id) => baitName(id)).join(" + ")
})
const baitIcon = computed(() => ((store.me?.baitEq ?? ["worm"])[0] === "worm" ? "worm" : "bait"))
const baitCount = computed(() => {
  const id = (store.me?.baitEq ?? ["worm"])[0] ?? "worm"
  if (id === "worm") return "∞"
  return String(store.me?.bait.find((b) => b.id === id)?.n ?? 0)
})
const waiting = computed(() => fishUi.phase === "waiting" || fishUi.phase === "flying")
/** The bait chip only between casts: a slip onto it mid-fight would open the shop and lose the fish. */
const baitOpen = computed(() => fishUi.phase === "idle" || fishUi.phase === "charging")

// ── the tap meter: red when the fish is winning, green when it is nearly in ──
const fight = computed(() => fishUi.fight)
const low = computed(() => (fight.value?.progress ?? 1) < 0.2)
const fightStyle = computed(() => {
  const f = fight.value
  if (!f) return {}
  const hue = Math.round(Math.max(0, Math.min(1, f.progress)) * 120)
  return {
    "--prog": String(f.progress),
    "--start": String(FIGHT.start),
    "--fill": `hsl(${hue} 85% 52%)`,
    "--fill-dark": `hsl(${hue} 80% 36%)`,
    "--rarity": RARITY_CSS[f.rarity] ?? "#fff",
  }
})
/** A "+" pops off the fill on every counted tap (the last few stay animating). */
const pops = ref<{ id: number; x: number; dx: number }[]>([])
watch(
  () => fishUi.fight?.taps ?? 0,
  (taps, before) => {
    if (!taps || taps <= before) {
      if (!taps) pops.value = []
      return
    }
    pops.value = [...pops.value.slice(-4), { id: taps, x: fishUi.fight?.progress ?? 0, dx: Math.round(Math.random() * 60 - 30) }]
    meter.value?.animate([{ transform: "scale(1.045)" }, { transform: "scale(1)" }], { duration: 140, easing: "ease-out" })
    actionButton.value?.animate([{ transform: "scale(0.9)" }, { transform: "scale(1)" }], { duration: 120, easing: "ease-out" })
  },
)
/** The meter itself is a big tap target too. */
function tapMeter(): void {
  if (fishUi.phase === "reeling") props.fishing.press()
}
</script>

<template>
  <div class="ui-group ui-group--bottom dock">
    <p v-if="fishUi.hint && showCast" class="dock__hint" :class="{ 'dock__hint--hot': fishUi.phase === 'bite' }">{{ t(fishUi.hint) }}</p>
    <div
      v-if="fight"
      ref="meter"
      class="reel"
      :class="{ 'reel--low': low, 'reel--surge': fight.surge }"
      :style="fightStyle"
      role="presentation"
      @pointerdown.prevent="tapMeter"
    >
      <div class="reel__track">
        <div class="reel__fill"></div>
        <i v-if="fight.perfect" class="reel__start"></i>
        <div class="reel__fish"><Icon name="fish" /></div>
        <span v-for="pop in pops" :key="pop.id" class="reel__pop" :style="{ '--x': String(pop.x), '--dx': pop.dx + 'px' }">+</span>
      </div>
      <span v-if="fight.perfect" class="reel__perfect">{{ t("hud.perfect") }}</span>
    </div>
    <button v-if="offer && fishUi.phase === 'idle'" type="button" class="offer" @click="offer.run()"><Icon :name="offer.icon" />{{ offer.label }}</button>
    <!-- the action button sits in the middle column, so chips coming and going never move it -->
    <div class="dock__row">
      <div class="dock__side dock__side--left">
        <button v-show="showCast && baitOpen" type="button" class="chip chip--bait" :aria-label="t('hud.bait') + ': ' + bait" @click="emit('bait')">
          <Icon :name="baitIcon" />
          <span>{{ baitCount }}</span>
        </button>
      </div>
      <button
        v-show="showCast"
        ref="actionButton"
        type="button"
        class="action"
        :class="['action--' + fishUi.phase, { 'action--bad': fishUi.phase === 'charging' && !fishUi.valid }]"
        :style="ringStyle"
        :aria-label="label"
      >
        <span class="action__ring"></span>
        <Icon :name="fishUi.phase === 'reeling' ? 'fish' : 'rod'" />
        <span class="action__label">{{ label }}</span>
        <span class="action__key">{{ t("hud.key_cast") }}</span>
      </button>
      <div class="dock__side">
        <button v-if="showCast && waiting" type="button" class="chip chip--reelin" :aria-label="t('hud.reel_in')" @click="fishing.reelIn()">
          <Icon name="rod" />
          <span>{{ t("hud.reel_in") }}</span>
        </button>
        <button v-show="!!npcName && fishUi.phase === 'idle'" ref="talkButton" type="button" class="chip chip--talk" :aria-label="t('hud.talk_to', { name: npcName })">
          <Icon name="scroll" />
          <span>{{ t("hud.talk") }}</span>
          <span class="action__key">{{ t("hud.key_talk") }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dock {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 960px;
}
.dock__hint {
  margin: 0;
  padding: 8px 22px;
  border-radius: 999px;
  background: rgb(9 27 41 / 78%);
  font-size: 48px;
  white-space: nowrap;
}
.dock__hint--hot {
  background: #ffcf3a;
  color: #3a2000;
  -webkit-text-stroke: 0;
  animation: pulse 0.35s ease-in-out infinite alternate;
}
.offer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 26px;
  border: 5px solid #0b1a2a;
  border-radius: 999px;
  background: linear-gradient(#ffe27a, #ff9a3c);
  color: #3a2000;
  -webkit-text-stroke: 0;
  font-size: 48px;
  box-shadow: 0 7px 0 #0b1a2a;
  pointer-events: auto;
  animation: pulse 0.6s ease-in-out infinite alternate;
}
.offer :deep(.icon) {
  width: 56px;
  height: 56px;
}
.dock__row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 18px;
  width: 100%;
  pointer-events: none;
}
.dock__side {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
}
.dock__side--left {
  justify-content: flex-end;
}
.chip {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 200px;
  padding: 12px 16px;
  border: 4px solid #0b1a2a;
  border-radius: 26px;
  background: linear-gradient(#ffffff, #dfeaf4);
  color: #13283c;
  -webkit-text-stroke: 0;
  font-size: 48px;
  pointer-events: auto;
  cursor: pointer;
  box-shadow: 0 6px 0 #0b1a2a;
}
.chip span:not(.action__key) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip :deep(.icon) {
  width: 46px;
  height: 46px;
}
.chip--talk {
  background: linear-gradient(#fff3b0, #ffd34d);
  max-width: 300px;
}
.action {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 210px;
  height: 210px;
  border: 6px solid #0b1a2a;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #8affa0, #2fbf5a 70%);
  color: #fff;
  pointer-events: auto;
  cursor: pointer;
  box-shadow: 0 10px 0 #0b1a2a, 0 0 0 6px rgb(255 255 255 / 25%);
  touch-action: none;
  transition: transform 0.08s;
}
.action:active {
  transform: translateY(6px);
  box-shadow: 0 4px 0 #0b1a2a;
}
.action :deep(.icon) {
  width: 84px;
  height: 84px;
}
.action__label {
  font-size: 48px;
  line-height: 1;
}
.action__key {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 54px;
  height: 54px;
  border: 4px solid #0b1a2a;
  border-radius: 14px;
  background: #fff;
  color: #13283c;
  -webkit-text-stroke: 0;
  font-size: 48px;
  line-height: 46px;
  text-align: center;
}
.chip .action__key {
  position: static;
  flex: none;
  width: 44px;
  height: 44px;
  font-size: 48px;
  line-height: 36px;
}
.action__ring {
  position: absolute;
  inset: -16px;
  border-radius: 50%;
  background: conic-gradient(#ffe27a calc(var(--p) * 360deg), transparent 0);
  mask: radial-gradient(circle, transparent 60%, #000 61%);
  pointer-events: none;
}
.action--waiting,
.action--flying {
  background: radial-gradient(circle at 35% 30%, #9fd8ff, #3a8adf 70%);
}
.action--bite {
  background: radial-gradient(circle at 35% 30%, #fff3a0, #ffb52e 70%);
  animation: pulse 0.3s ease-in-out infinite alternate;
}
.action--landing {
  filter: saturate(0.3);
}
.action--bad {
  background: radial-gradient(circle at 35% 30%, #ffb3a0, #e8463a 70%);
}
.action--reeling {
  background: radial-gradient(circle at 35% 30%, #ff9fd6, #e8467a 70%);
}
.action--reeling .action__label {
  font-size: 64px;
  animation: tap-pulse 0.32s ease-in-out infinite alternate;
}
.chip--reelin {
  max-width: 340px;
  margin-left: 22px;
  background: linear-gradient(#d9f0ff, #9fd2ff);
  font-size: 40px;
}
.chip--reelin :deep(.icon) {
  width: 40px;
  height: 40px;
}
.reel {
  position: relative;
  width: 940px;
  padding: 12px;
  border: 5px solid #0b1a2a;
  border-radius: 30px;
  background: rgb(9 27 41 / 88%);
  box-shadow: 0 8px 0 #0b1a2a;
  pointer-events: auto;
  touch-action: none;
  cursor: pointer;
}
.reel--low {
  border-color: #ff4a3a;
  box-shadow: 0 8px 0 #0b1a2a, 0 0 26px rgb(255 74 58 / 70%);
  animation: shake 0.22s linear infinite;
}
.reel__track {
  position: relative;
  height: 112px;
  border-radius: 24px;
  background: linear-gradient(#123a5a, #0b2740);
  box-shadow: inset 0 4px 0 rgb(0 0 0 / 35%);
}
.reel__fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: calc(var(--prog) * 100%);
  border-radius: 24px;
  background: linear-gradient(var(--fill), var(--fill-dark));
  box-shadow: inset 0 6px 0 rgb(255 255 255 / 30%);
  transition: width 0.08s linear;
}
.reel__start {
  position: absolute;
  top: -8px;
  bottom: -8px;
  left: calc(var(--start) * 100% - 3px);
  width: 6px;
  border-radius: 3px;
  background: #ffe27a;
  opacity: 0.85;
}
.reel__fish {
  position: absolute;
  top: 6px;
  left: calc(var(--prog) * 100% - 50px);
  width: 100px;
  height: 100px;
  filter: drop-shadow(0 0 10px var(--rarity)) drop-shadow(0 0 4px var(--rarity));
  transition: left 0.08s linear;
  animation: wiggle 0.5s ease-in-out infinite alternate;
}
.reel--surge .reel__fish {
  animation-duration: 0.12s;
}
.reel__fish :deep(.icon) {
  width: 100px;
  height: 100px;
}
.reel__pop {
  position: absolute;
  top: 14px;
  left: calc(var(--x) * 100% + var(--dx));
  color: #fff;
  font-size: 64px;
  line-height: 1;
  pointer-events: none;
  animation: pop 0.55s ease-out forwards;
}
.reel__perfect {
  position: absolute;
  top: 50%;
  left: calc(100% + 18px);
  translate: 0 -50%;
  color: #ffe27a;
  font-size: 44px;
  white-space: nowrap;
  pointer-events: none;
}
@keyframes tap-pulse {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.18);
  }
}
@keyframes shake {
  0%,
  100% {
    translate: 0 0;
  }
  25% {
    translate: -6px 0;
  }
  75% {
    translate: 6px 0;
  }
}
@keyframes wiggle {
  from {
    rotate: -10deg;
  }
  to {
    rotate: 10deg;
  }
}
@keyframes pop {
  from {
    opacity: 1;
    transform: translateY(0) scale(0.7);
  }
  to {
    opacity: 0;
    transform: translateY(-90px) scale(1.3);
  }
}
@keyframes pulse {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.07);
  }
}
</style>
