<script setup lang="ts">
// Bottom centre: the hint, the reel bar during a fight, the big action button (cast / hook / hold),
// the bait chip and the talk button near a keeper. Keys: E acts, Q talks.
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import type { IGame } from "@blombo/game-runtime"
import { t } from "@/text"
import Icon from "./Icon.vue"
import { fishUi, type Fishing } from "../fishing/controller"
import { store } from "../net"
import { RARITY_CSS, baitName } from "./format"

const props = defineProps<{ game: IGame; fishing: Fishing; npcName: string; showCast: boolean; offer?: { label: string; icon: string; run: () => void } | null }>()
const emit = defineEmits<{ talk: []; bait: [] }>()

const actionButton = ref<HTMLButtonElement | null>(null)
const talkButton = ref<HTMLButtonElement | null>(null)
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
      return t("hud.reel_in")
    case "bite":
      return t("hud.hook")
    case "reeling":
      return t("hud.hold")
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
const fight = computed(() => fishUi.fight)
const fightStyle = computed(() => {
  const f = fight.value
  if (!f) return {}
  return {
    "--zone": String(f.zone),
    "--w": String(f.width),
    "--fish": String(f.fish),
    "--prog": String(f.progress),
    "--rarity": RARITY_CSS[f.rarity] ?? "#fff",
  }
})
</script>

<template>
  <div class="ui-group ui-group--bottom dock">
    <p v-if="fishUi.hint && showCast" class="dock__hint" :class="{ 'dock__hint--hot': fishUi.phase === 'bite' }">{{ t(fishUi.hint) }}</p>
    <div v-if="fight" class="reel" :style="fightStyle" role="presentation">
      <div class="reel__bar">
        <div class="reel__zone" :class="{ 'reel__zone--in': fight.inside }"></div>
        <div class="reel__fish"><Icon name="fish" /></div>
      </div>
      <div class="reel__meter"><div class="reel__fill"></div></div>
      <span v-if="fight.perfect" class="reel__perfect">{{ t("hud.perfect") }}</span>
    </div>
    <button v-if="offer && fishUi.phase === 'idle'" type="button" class="offer" @click="offer.run()"><Icon :name="offer.icon" />{{ offer.label }}</button>
    <div class="dock__row">
      <button v-show="showCast" type="button" class="chip chip--bait" :aria-label="t('hud.bait') + ': ' + bait" @click="emit('bait')">
        <Icon :name="baitIcon" />
        <span>{{ baitCount }}</span>
      </button>
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
      <button v-show="!!npcName && fishUi.phase === 'idle'" ref="talkButton" type="button" class="chip chip--talk" :aria-label="t('hud.talk_to', { name: npcName })">
        <Icon name="scroll" />
        <span>{{ t("hud.talk") }}</span>
        <span class="action__key">{{ t("hud.key_talk") }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.dock {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 700px;
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  pointer-events: none;
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
.action--reeling {
  background: radial-gradient(circle at 35% 30%, #ff9fd6, #e8467a 70%);
}
.action--landing {
  filter: saturate(0.3);
}
.action--bad {
  background: radial-gradient(circle at 35% 30%, #ffb3a0, #e8463a 70%);
}
.reel {
  position: relative;
  width: 680px;
  padding: 14px 18px 18px;
  border: 5px solid #0b1a2a;
  border-radius: 28px;
  background: rgb(9 27 41 / 88%);
  box-shadow: 0 8px 0 #0b1a2a;
}
.reel__bar {
  position: relative;
  height: 72px;
  border-radius: 20px;
  background: linear-gradient(#1e5a8a, #123a5a);
  overflow: hidden;
}
.reel__zone {
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: calc((var(--zone) - var(--w) / 2) * 100%);
  width: calc(var(--w) * 100%);
  border-radius: 14px;
  background: rgb(95 255 138 / 55%);
  border: 4px solid #5fff8a;
}
.reel__zone--in {
  background: rgb(95 255 138 / 85%);
}
.reel__fish {
  position: absolute;
  top: 10px;
  left: calc(var(--fish) * 100% - 26px);
  width: 52px;
  height: 52px;
  filter: drop-shadow(0 0 8px var(--rarity));
}
.reel__fish :deep(.icon) {
  width: 52px;
  height: 52px;
}
.reel__meter {
  margin-top: 12px;
  height: 22px;
  border-radius: 11px;
  background: #0b1a2a;
  overflow: hidden;
}
.reel__fill {
  width: calc(var(--prog) * 100%);
  height: 100%;
  background: linear-gradient(90deg, #ffe27a, #5fff8a);
}
.reel__perfect {
  position: absolute;
  top: -40px;
  right: 18px;
  color: #ffe27a;
  font-size: 48px;
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
