<script setup lang="ts">
// The Fish Index: every species by water, its rarity, when it bites, your count, best weight and shinies.
import { computed, ref } from "vue"
import { t } from "@/text"
import Icon from "./Icon.vue"
import FishIcon from "./FishIcon.vue"
import { store } from "../net"
import { INDEX_TIERS, SPECIES, SPECIES_PER_ZONE, ZONES } from "../../server/rules.ts"
import { RARITY_CSS, kg } from "./format"

const emit = defineEmits<{ close: [] }>()
const zone = ref(store.me?.zone ?? 0)
const list = computed(() => SPECIES.map((s, i) => ({ s, i })).filter((x) => x.s.zone === zone.value))
const found = computed(() => list.value.filter((x) => (store.dex?.c[x.i] ?? 0) > 0).length)
const total = computed(() => SPECIES.filter((s, i) => (store.dex?.c[i] ?? 0) > 0).length)
const unlocked = (z: number) => (((store.me?.zones ?? 1) >> z) & 1) === 1
function when(i: number): string {
  const s = SPECIES[i]!
  if (s.weather) return t("when." + s.weather)
  if (s.time) return t("when." + s.time)
  if (ZONES[s.zone]?.nightOnly) return t("when.night")
  return t("when.any")
}
</script>

<template>
  <section class="ui-group ui-group--center card index" role="dialog" aria-labelledby="index-title">
    <header class="card__head">
      <Icon name="book" class="card__icon" />
      <h1 id="index-title">{{ t("card.index") }}</h1>
      <span class="index__count">{{ t("hud.progress", { n: total, t: SPECIES.length }) }}</span>
      <button type="button" class="card__close" :aria-label="t('hud.close')" @click="emit('close')"><Icon name="close" /></button>
    </header>
    <div class="tabs">
      <button v-for="(z, i) in ZONES" :key="z.key" type="button" :class="{ on: zone === i }" @click="zone = i">
        <Icon v-if="!unlocked(i)" name="lock" class="tab__lock" />{{ t("zone." + z.key) }}
      </button>
    </div>
    <div class="tiers">
      <span>{{ t("index.zone_progress", { n: found, t: SPECIES_PER_ZONE }) }}</span>
      <span v-for="(n, k) in INDEX_TIERS" :key="n" class="tier" :class="{ on: (store.dex?.ir[zone] ?? 0) > k }"><Icon name="gift" />{{ n }}</span>
    </div>
    <div class="card__content grid" tabindex="-1">
      <article
        v-for="x in list"
        :key="x.s.id"
        class="tile"
        :class="{ unknown: !(store.dex?.c[x.i] ?? 0) }"
        :style="{ '--rc': RARITY_CSS[x.s.rarity] }"
      >
        <span class="tile__rarity">{{ t("rarity." + x.s.rarity) }}</span>
        <FishIcon :species="x.i" :unknown="!(store.dex?.c[x.i] ?? 0)" :shiny="(store.dex?.sh[x.i] ?? 0) > 0" class="tile__fish" />
        <strong>{{ (store.dex?.c[x.i] ?? 0) ? t("fish." + x.s.id) : t("hud.unknown") }}</strong>
        <small>{{ when(x.i) }}</small>
        <small v-if="store.dex?.c[x.i]">{{ t("hud.caught_n", { n: store.dex.c[x.i]! }) }} · {{ t("hud.best", { kg: kg(store.dex.b[x.i]!) }) }}</small>
        <Icon v-if="(store.dex?.sh[x.i] ?? 0) > 0" name="sparkle" class="tile__shiny" />
      </article>
    </div>
  </section>
</template>

<style scoped>
.index {
  width: 1120px;
}
.index__count {
  margin-left: auto;
  color: #9fe9ff;
}
.tab__lock {
  display: inline-block;
  width: 40px !important;
  height: 40px !important;
  margin-right: 6px;
  vertical-align: -6px;
}
.tiers {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.tier {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 14px;
  border: 4px solid #0b1a2a;
  border-radius: 999px;
  background: #2b5a80;
  opacity: 0.6;
}
.tier.on {
  background: #ff6fa8;
  opacity: 1;
}
.tier :deep(.icon) {
  width: 48px;
  height: 48px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 6px 14px;
  border: 5px solid #0b1a2a;
  border-top: 14px solid var(--rc);
  border-radius: 24px;
  background: #1b3f5e;
  text-align: center;
  min-width: 0;
  overflow-wrap: anywhere;
}
.tile strong {
  font-size: 48px;
  line-height: 1.05;
}
.tile small {
  font-size: 48px;
  line-height: 1.05;
  color: #b8d0e4;
}
.tile__rarity {
  color: var(--rc);
}
.tile__fish {
  width: 168px;
  height: 168px;
  margin: -26px 0 -30px;
}
.tile__shiny {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 52px !important;
  height: 52px !important;
}
</style>
