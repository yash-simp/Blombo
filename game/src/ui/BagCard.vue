<script setup lang="ts">
// The bag: every kept fish, sell all at a market, lock favourites, move fish to the home aquarium.
import { computed, ref } from "vue"
import type { IGame } from "@blombo/game-runtime"
import { t } from "@/text"
import Icon from "./Icon.vue"
import FishIcon from "./FishIcon.vue"
import { store } from "../net"
import { SPECIES, fishValue } from "../../server/rules.ts"
import { RARITY_CSS, fishName, kg, num } from "./format"
import { PLACEMENTS, paidUi, units, use, watchFor } from "../paidClient"

const props = defineProps<{ game: IGame; nearMarket: boolean }>()
const emit = defineEmits<{ close: [] }>()
const tab = ref<"bag" | "aquarium">("bag")

const fish = computed(() => {
  const list = store.bag?.fish ?? []
  return [...list].sort((a, b) => (SPECIES[b[1]!]?.rarity ?? 0) - (SPECIES[a[1]!]?.rarity ?? 0) || (b[2] ?? 0) - (a[2] ?? 0))
})
const total = computed(() =>
  (store.bag?.fish ?? []).reduce((sum, f) => (((f[3] ?? 0) & 2) === 0 ? sum + fishValue(f[1]!, f[2]!, ((f[3] ?? 0) & 1) !== 0) : sum), 0),
)
const myHome = computed(() => store.homes.find((h) => h.u === store.userId))

function sellAll(): void {
  props.game.remotes.send("Sell", { all: true, ids: [] })
  emit("close")
}
function sellOne(uid: number): void {
  props.game.remotes.send("Sell", { all: false, ids: [uid] })
}
function saleBoost(): void {
  if (units("sale_boost_1") > 0) use("sale_boost_1")
  else watchFor(PLACEMENTS.sale, "sale_boost_1")
  emit("close")
}
function lock(uid: number): void {
  props.game.remotes.send("Lock", uid)
}
function toAquarium(uid: number): void {
  props.game.remotes.send("Aquarium", { add: uid, remove: 0 })
}
function fromAquarium(uid: number): void {
  props.game.remotes.send("Aquarium", { add: 0, remove: uid })
}
</script>

<template>
  <section class="ui-group ui-group--center card bag" role="dialog" aria-labelledby="bag-title">
    <header class="card__head">
      <Icon name="bag" class="card__icon" />
      <h1 id="bag-title">{{ t("card.bag") }}</h1>
      <span class="bag__count">{{ t("hud.bag", { n: store.bag?.fish.length ?? 0, cap: store.bag?.cap ?? 25 }) }}</span>
      <button type="button" class="card__close" :aria-label="t('hud.close')" @click="emit('close')"><Icon name="close" /></button>
    </header>
    <div class="tabs">
      <button type="button" :class="{ on: tab === 'bag' }" @click="tab = 'bag'">{{ t("card.bag") }}</button>
      <button type="button" :class="{ on: tab === 'aquarium' }" @click="tab = 'aquarium'">{{ t("bag.aquarium", { n: myHome?.f.length ?? 0 }) }}</button>
    </div>
    <div class="card__content bag__list" tabindex="-1">
      <template v-if="tab === 'bag'">
        <p v-if="!fish.length" class="bag__empty">{{ t("bag.empty") }}</p>
        <article v-for="f in fish" :key="f[0]" class="row" :style="{ '--rc': RARITY_CSS[SPECIES[f[1]!]?.rarity ?? 0] }">
          <FishIcon :species="f[1]!" :shiny="(f[3]! & 1) !== 0" class="row__fish" />
          <div class="row__main">
            <strong>{{ fishName(f[1]!) }}<Icon v-if="(f[3]! & 1) !== 0" name="sparkle" class="row__shiny" /></strong>
            <small>{{ t("rarity." + (SPECIES[f[1]!]?.rarity ?? 0)) }} · {{ t("hud.weight", { kg: kg(f[2]!) }) }}</small>
          </div>
          <span class="row__coins"><Icon name="coin" />{{ num(fishValue(f[1]!, f[2]!, (f[3]! & 1) !== 0)) }}</span>
          <button type="button" class="mini" :class="{ on: (f[3]! & 2) !== 0 }" :aria-label="(f[3]! & 2) !== 0 ? t('bag.unlock') : t('bag.lock')" @click="lock(f[0]!)">
            <Icon name="lock" />
          </button>
          <button type="button" class="mini" :aria-label="t('bag.to_aquarium')" @click="toAquarium(f[0]!)"><Icon name="home" /></button>
          <button v-if="nearMarket" type="button" class="mini mini--sell" :aria-label="t('hud.sell_all')" @click="sellOne(f[0]!)"><Icon name="coin" /></button>
        </article>
      </template>
      <template v-else>
        <article v-for="f in myHome?.f ?? []" :key="f[0]" class="row" :style="{ '--rc': RARITY_CSS[SPECIES[f[1]!]?.rarity ?? 0] }">
          <FishIcon :species="f[1]!" :shiny="((f[3] ?? 0) & 1) !== 0" class="row__fish" />
          <div class="row__main">
            <strong>{{ fishName(f[1]!) }}</strong>
            <small>{{ t("hud.weight", { kg: kg(f[2]!) }) }}</small>
          </div>
          <button type="button" class="pill" @click="fromAquarium(f[0]!)">{{ t("bag.from_aquarium") }}</button>
        </article>
      </template>
    </div>
    <footer class="card__foot">
      <button v-if="nearMarket" type="button" class="big big--gold" :disabled="!total" @click="sellAll">
        <Icon name="coin" />{{ t("bag.sell_all", { coins: num(total) }) }}
      </button>
      <button v-if="nearMarket && total >= 50 && (units('sale_boost_1') > 0 || paidUi.ads[PLACEMENTS.sale])" type="button" class="big big--video" @click="saleBoost">
        <Icon :name="units('sale_boost_1') > 0 ? 'coin' : 'video'" />{{ units("sale_boost_1") > 0 ? t("shop.sale_use", { n: units("sale_boost_1") }) : t("shop.sale_video") }}
      </button>
      <p v-else class="bag__hint">{{ t("bag.sell_here") }}</p>
    </footer>
  </section>
</template>

<style scoped>
.bag {
  width: 900px;
}
.row__fish {
  width: 116px;
  height: 116px;
  margin: -18px -4px -18px -6px;
}
.bag__count {
  margin-left: auto;
  color: #ffe27a;
}
.bag__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card__foot {
  flex-wrap: wrap;
}
.big--video {
  background: linear-gradient(#ffe27a, #ff9a3c);
  color: #3a2000;
  -webkit-text-stroke: 0;
}
.bag__empty,
.bag__hint {
  margin: 0;
  text-align: center;
  color: #cfe0ee;
}
</style>
