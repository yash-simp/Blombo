<script setup lang="ts">
// The catch card in the bottom band; the fish itself spins in 3D just above it.
import { computed, onBeforeUnmount, onMounted } from "vue"
import { t } from "@/text"
import Icon from "./Icon.vue"
import FishIcon from "./FishIcon.vue"
import type { CatchView } from "../fishing/controller"
import { SPECIES, sizeOf } from "../../server/rules.ts"
import { RARITY_CSS, fishName, kg, num } from "./format"

const props = defineProps<{ c: CatchView }>()
const emit = defineEmits<{ close: [] }>()
const sp = computed(() => SPECIES[props.c.s]!)
const rarity = computed(() => sp.value.rarity)
const size = computed(() => Math.round(sizeOf(props.c.s, props.c.g) * 100))
let timer = 0
onMounted(() => {
  timer = window.setTimeout(() => emit("close"), props.c.first ? 7000 : 5200)
})
onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <section class="ui-group ui-group--bottom catch" :style="{ '--rc': RARITY_CSS[rarity] }" role="status">
    <div class="catch__badges">
      <span class="badge badge--rarity">{{ t("rarity." + rarity) }}</span>
      <span v-if="c.isNew" class="badge badge--new">{{ t("hud.new") }}</span>
      <span v-if="c.sh" class="badge badge--shiny"><Icon name="sparkle" />{{ t("hud.shiny") }}</span>
      <span v-if="c.perfect" class="badge badge--perfect">{{ t("hud.perfect") }}</span>
    </div>
    <div class="catch__title">
      <FishIcon :species="c.s" :shiny="c.sh" class="catch__fish" />
      <h2 class="catch__name">{{ fishName(c.s) }}</h2>
    </div>
    <div class="catch__stats">
      <span>{{ t("hud.weight", { kg: kg(c.g) }) }}</span>
      <span>{{ t("hud.size", { pct: size }) }}</span>
      <span class="catch__coins"><Icon name="coin" />{{ num(c.coins) }}</span>
      <span class="catch__xp">{{ t("hud.xp", { xp: c.xp }) }}</span>
    </div>
    <button type="button" class="catch__ok" @click="emit('close')">{{ t("hud.ok") }}</button>
  </section>
</template>

<style scoped>
.catch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 660px;
  padding: 18px 26px 22px;
  border: 6px solid #0b1a2a;
  border-radius: 30px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--rc) 35%, #0d2236) 0%, #0d2236 60%);
  box-shadow: 0 10px 0 #0b1a2a, 0 0 40px color-mix(in srgb, var(--rc) 60%, transparent);
  pointer-events: auto;
  animation: pop 0.35s cubic-bezier(0.2, 1.6, 0.4, 1);
}
.catch__badges {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 16px;
  border: 4px solid #0b1a2a;
  border-radius: 999px;
  font-size: 48px;
}
.badge :deep(.icon) {
  width: 34px;
  height: 34px;
}
.badge--rarity {
  background: var(--rc);
  color: #0b1a2a;
  -webkit-text-stroke: 0;
}
.badge--new {
  background: #ff5f7a;
}
.badge--shiny {
  background: linear-gradient(90deg, #fff3a0, #ffd34d, #fff3a0);
  color: #5a3a00;
  -webkit-text-stroke: 0;
}
.badge--perfect {
  background: #5fff8a;
  color: #0b3a1a;
  -webkit-text-stroke: 0;
}
.catch__title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  max-width: 100%;
}
.catch__fish {
  width: 150px;
  height: 150px;
  margin: -30px -6px -30px -18px;
  animation: catch-swim 1.8s ease-in-out infinite;
}
@keyframes catch-swim {
  0%,
  100% {
    rotate: -6deg;
    translate: 0 4px;
  }
  50% {
    rotate: 5deg;
    translate: 0 -6px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .catch__fish {
    animation: none;
  }
}
.catch__name {
  min-width: 0;
  margin: 0;
  font-size: 66px;
  line-height: 1.05;
  text-align: center;
  color: #fff;
}
.catch__stats {
  display: flex;
  gap: 22px;
  flex-wrap: wrap;
  justify-content: center;
  font-size: 48px;
}
.catch__coins {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #ffe27a;
}
.catch__coins :deep(.icon) {
  width: 42px;
  height: 42px;
}
.catch__xp {
  color: #9fe9ff;
}
.catch__ok {
  margin-top: 4px;
  padding: 10px 56px;
  border: 5px solid #0b1a2a;
  border-radius: 999px;
  background: linear-gradient(#8affa0, #2fbf5a);
  color: #fff;
  font-size: 48px;
  cursor: pointer;
  box-shadow: 0 6px 0 #0b1a2a;
}
@keyframes pop {
  from {
    scale: 0.6;
    opacity: 0;
  }
}
</style>
