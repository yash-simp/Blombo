<script setup lang="ts">
// The harbour map: every water, where you are, which you can sail to and what unlocks the rest.
import { computed } from "vue"
import type { IGame } from "@blombo/game-runtime"
import { t } from "@/text"
import Icon from "./Icon.vue"
import { store } from "../net"
import { BOATS, ZONES, levelOf } from "../../server/rules.ts"
import { num } from "./format"

const props = defineProps<{ game: IGame; atDock: boolean }>()
const emit = defineEmits<{ close: [] }>()
const level = computed(() => levelOf(store.me?.xp ?? 0).level)
const coins = computed(() => store.me?.coins ?? 0)
const unlocked = (i: number) => (((store.me?.zones ?? 1) >> i) & 1) === 1
const boat = computed(() => BOATS[store.me?.boat ?? 0] ?? BOATS[0]!)
const ZONE_COLORS = ["#ffbf3a", "#7fd46a", "#3fd6e8", "#bfe6ff", "#ff7a3a", "#c7a6ff"]

function sail(i: number): void {
  props.game.remotes.send("Travel", i)
}
function unlock(i: number): void {
  props.game.remotes.send("Buy", { kind: "zone", id: i })
}
</script>

<template>
  <section class="ui-group ui-group--center card travel" role="dialog" aria-labelledby="travel-title">
    <header class="card__head">
      <Icon name="map" class="card__icon" />
      <h1 id="travel-title">{{ t("card.travel") }}</h1>
      <span class="travel__boat"><Icon name="boat" />{{ t("boat." + boat.id) }}</span>
      <button type="button" class="card__close" :aria-label="t('hud.close')" @click="emit('close')"><Icon name="close" /></button>
    </header>
    <div class="card__content list" tabindex="-1">
      <article
        v-for="(z, i) in ZONES"
        :key="z.key"
        class="row zone"
        :class="{ here: store.me?.zone === i, locked: !unlocked(i) }"
        :style="{ '--zc': ZONE_COLORS[i], '--rc': ZONE_COLORS[i] }"
      >
        <span class="zone__badge"><Icon :name="unlocked(i) ? (z.nightOnly ? 'moon' : 'fish') : 'lock'" /></span>
        <div class="row__main">
          <strong>{{ t("zone." + z.key) }}<span v-if="z.coinMult > 1" class="mult"> ×{{ z.coinMult }}</span></strong>
          <small class="wrap">{{ t("zone.desc." + z.key) }}</small>
        </div>
        <button v-if="store.me?.zone === i" type="button" class="pill pill--blue" disabled>{{ t("travel.here") }}</button>
        <button v-else-if="unlocked(i)" type="button" class="pill" :disabled="!atDock" @click="sail(i)"><Icon name="boat" />{{ t("travel.go") }}</button>
        <button v-else-if="level < z.level" type="button" class="pill" disabled><Icon name="lock" />{{ t("travel.locked_level", { lv: z.level }) }}</button>
        <button v-else type="button" class="pill pill--gold" :disabled="coins < z.coins" @click="unlock(i)"><Icon name="coin" />{{ num(z.coins) }}</button>
      </article>
    </div>
    <footer v-if="!atDock" class="card__foot">
      <p class="travel__hint"><Icon name="boat" class="inline" />{{ t("travel.at_dock") }}</p>
    </footer>
  </section>
</template>

<style scoped>
.travel {
  width: 1000px;
}
.travel__boat {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  color: #9fe9ff;
}
.travel__boat :deep(.icon) {
  width: 60px;
  height: 60px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.zone.here {
  background: #24506e;
}
.zone.locked {
  opacity: 0.72;
}
.zone__badge {
  display: grid;
  flex: none;
  place-items: center;
  width: 92px;
  height: 92px;
  border: 5px solid #0b1a2a;
  border-radius: 50%;
  background: var(--zc);
}
.zone__badge :deep(.icon) {
  width: 64px;
  height: 64px;
}
.mult {
  color: #ffe27a;
}
.wrap {
  white-space: normal !important;
}
.travel__hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 0;
  color: #cfe0ee;
  text-align: center;
}
.inline {
  flex: none;
  width: 60px !important;
  height: 60px !important;
}
</style>
