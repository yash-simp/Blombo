<script setup lang="ts">
// The Tackle Shop: rods, reels, bait, bag upgrades, boats and rod skins, all for coins.
import { computed, ref } from "vue"
import type { IGame } from "@blombo/game-runtime"
import { t } from "@/text"
import Icon from "./Icon.vue"
import { store } from "../net"
import { BAG_COINS, BAG_SIZES, BAITS, BOATS, REELS, RODS, SKINS, levelOf } from "../../server/rules.ts"
import { num } from "./format"
import { PLACEMENTS, SHOP_ORDER, buy as buyPaid, owns, paidUi, product, units, use, watchFor } from "../paidClient"

const props = defineProps<{ game: IGame; tab: string }>()
const emit = defineEmits<{ close: [] }>()
const tab = ref(props.tab || "rods")
const level = computed(() => levelOf(store.me?.xp ?? 0).level)
const coins = computed(() => store.me?.coins ?? 0)

function buy(kind: "rod" | "reel" | "bait" | "bag" | "zone" | "boat", id: number): void {
  props.game.remotes.send("Buy", { kind, id })
}
function equip(kind: "rod" | "bait" | "skin" | "title" | "boat", id: string): void {
  props.game.remotes.send("Equip", { kind, id })
}
const ownsRod = (i: number) => ((store.me?.rods ?? 1) >> i) & 1
const baitHave = (id: string) => (id === "worm" ? -1 : (store.me?.bait.find((b) => b.id === id)?.n ?? 0))
const baitOn = (id: string) => (store.me?.baitEq ?? []).includes(id)
const ownsBoat = (i: number) => (BOATS[i]?.paid ? owns(BOATS[i]!.paid!) : ((store.me?.boats ?? 1) >> i) & 1)
const blogemRows = computed(() => SHOP_ORDER.map((id) => ({ id, p: product(id) })).filter((r) => !!r.p))
const PAID_SKIN: Record<string, string> = { skin_rainbow: "rainbow", skin_dragon: "dragon", skin_candy: "candy" }
function setAuto(on: boolean): void {
  props.game.remotes.send("Setting", { auto: on })
}
</script>

<template>
  <section class="ui-group ui-group--center card shop" role="dialog" aria-labelledby="shop-title">
    <header class="card__head">
      <Icon name="shop" class="card__icon" />
      <h1 id="shop-title">{{ t("card.shop") }}</h1>
      <span class="shop__coins"><Icon name="coin" />{{ num(coins) }}</span>
      <button type="button" class="card__close" :aria-label="t('hud.close')" @click="emit('close')"><Icon name="close" /></button>
    </header>
    <div class="tabs">
      <button v-for="k in ['rods', 'reels', 'bait', 'bag', 'boats', 'skins', 'blogems']" :key="k" type="button" :class="{ on: tab === k }" @click="tab = k">{{ t("tab." + k) }}</button>
    </div>
    <div class="card__content list" tabindex="-1">
      <template v-if="tab === 'rods'">
        <article v-for="(rod, i) in RODS" :key="rod.id" class="row" :class="{ dim: level < rod.level && !ownsRod(i) }">
          <Icon name="rod" class="row__icon" />
          <div class="row__main">
            <strong>{{ t("rod." + rod.id) }}</strong>
            <small>{{ t("shop.power", { n: rod.power }) }} · {{ t("shop.luck", { n: Math.round(rod.luck * 100) }) }} · {{ t("shop.range", { n: rod.range }) }}</small>
          </div>
          <button v-if="store.me?.rod === i" type="button" class="pill pill--blue" disabled>{{ t("hud.equipped") }}</button>
          <button v-else-if="ownsRod(i)" type="button" class="pill" @click="equip('rod', rod.id)">{{ t("hud.equip") }}</button>
          <button v-else-if="level < rod.level" type="button" class="pill" disabled><Icon name="lock" />{{ t("hud.need_level", { n: rod.level }) }}</button>
          <button v-else type="button" class="pill pill--gold" :disabled="coins < rod.coins" @click="buy('rod', i)"><Icon name="coin" />{{ num(rod.coins) }}</button>
        </article>
      </template>
      <template v-else-if="tab === 'reels'">
        <article v-for="(reel, i) in REELS" :key="reel.id" class="row" :class="{ dim: level < reel.level && (store.me?.reel ?? 0) < i }">
          <Icon name="gear" class="row__icon" />
          <div class="row__main">
            <strong>{{ t("reel." + reel.id) }}</strong>
            <small>{{ t("shop.tap", { n: Math.round(reel.tap * 100) }) }}</small>
          </div>
          <button v-if="(store.me?.reel ?? 0) >= i" type="button" class="pill pill--blue" disabled>{{ t("hud.owned") }}</button>
          <button v-else-if="level < reel.level" type="button" class="pill" disabled><Icon name="lock" />{{ t("hud.need_level", { n: reel.level }) }}</button>
          <button v-else type="button" class="pill pill--gold" :disabled="coins < reel.coins" @click="buy('reel', i)"><Icon name="coin" />{{ num(reel.coins) }}</button>
        </article>
      </template>
      <template v-else-if="tab === 'bait'">
        <article class="row row--lucky">
          <Icon name="sparkle" class="row__icon" />
          <div class="row__main">
            <strong>{{ t("shop.lucky_title") }}<span v-if="(store.me?.lucky ?? 0) > 0" class="have"> · {{ t("shop.lucky_on", { s: store.me?.lucky ?? 0 }) }}</span></strong>
            <small class="wrap">{{ t("shop.lucky_desc") }}</small>
          </div>
          <button v-if="units('lucky_bait_3') > 0" type="button" class="pill" :disabled="(store.me?.lucky ?? 0) > 0" @click="use('lucky_bait_3')">
            {{ t("shop.use_lucky", { n: units("lucky_bait_3") }) }}
          </button>
          <button v-else-if="paidUi.ads[PLACEMENTS.lucky]" type="button" class="pill pill--video" :disabled="(store.me?.lucky ?? 0) > 0" @click="watchFor(PLACEMENTS.lucky, 'lucky_bait_3')">
            <Icon name="video" />{{ t("shop.watch") }}
          </button>
          <button type="button" class="pill pill--gem" @click="buyPaid('lucky_bait_3')"><Icon name="blogem" />{{ product("lucky_bait_3")?.priceBlogems ?? "" }}</button>
        </article>
        <article v-for="(bait, i) in BAITS" :key="bait.id" class="row" :class="{ sel: baitOn(bait.id) }">
          <Icon :name="bait.id === 'worm' ? 'worm' : 'bait'" class="row__icon" />
          <div class="row__main">
            <strong>{{ t("bait." + bait.id) }}<span v-if="baitHave(bait.id) >= 0" class="have"> · {{ t("shop.have_n", { n: baitHave(bait.id) }) }}</span></strong>
            <small>{{ t("bait.desc." + bait.id) }}</small>
          </div>
          <button type="button" class="pill" :class="{ 'pill--blue': baitOn(bait.id) }" :disabled="bait.id !== 'worm' && baitHave(bait.id) <= 0 && !baitOn(bait.id)" @click="equip('bait', bait.id)">
            {{ baitOn(bait.id) ? t("hud.equipped") : t("hud.equip") }}
          </button>
          <button v-if="bait.coins" type="button" class="pill pill--gold" :disabled="coins < bait.coins" @click="buy('bait', i)">
            {{ t("shop.pack", { n: bait.pack }) }} <Icon name="coin" />{{ num(bait.coins) }}
          </button>
        </article>
      </template>
      <template v-else-if="tab === 'bag'">
        <article v-for="(cap, i) in BAG_SIZES" :key="cap" class="row" :class="{ dim: i > (store.me?.bag ?? 0) + 1 }">
          <Icon name="bag" class="row__icon" />
          <div class="row__main">
            <strong>{{ t("shop.bag_cap", { n: cap }) }}</strong>
          </div>
          <button v-if="(store.me?.bag ?? 0) >= i" type="button" class="pill pill--blue" disabled>{{ t("hud.owned") }}</button>
          <button v-else-if="i === (store.me?.bag ?? 0) + 1" type="button" class="pill pill--gold" :disabled="coins < BAG_COINS[i]!" @click="buy('bag', i)">
            <Icon name="coin" />{{ num(BAG_COINS[i]!) }}
          </button>
          <button v-else type="button" class="pill" disabled><Icon name="lock" /></button>
        </article>
      </template>
      <template v-else-if="tab === 'boats'">
        <article v-for="(boat, i) in BOATS" :key="boat.id" class="row">
          <Icon name="boat" class="row__icon" />
          <div class="row__main">
            <strong>{{ t("boat." + boat.id) }}</strong>
            <small>{{ t("shop.ride", { s: boat.rideMs / 1000 }) }}</small>
          </div>
          <button v-if="store.me?.boat === i" type="button" class="pill pill--blue" disabled>{{ t("hud.equipped") }}</button>
          <button v-else-if="ownsBoat(i)" type="button" class="pill" @click="equip('boat', boat.id)">{{ t("hud.equip") }}</button>
          <button v-else-if="boat.paid" type="button" class="pill" disabled><Icon name="blogem" /></button>
          <button v-else type="button" class="pill pill--gold" :disabled="coins < boat.coins" @click="buy('boat', i)"><Icon name="coin" />{{ num(boat.coins) }}</button>
        </article>
      </template>
      <template v-else-if="tab === 'blogems'">
        <p v-if="paidUi.state?.mode === 'test'" class="note">{{ t("shop.test") }}</p>
        <article v-for="r in blogemRows" :key="r.id" class="row" :class="{ sel: r.p!.kind === 'permanent' && owns(r.id) }">
          <Icon :name="r.id.startsWith('skin') ? 'sparkle' : r.id === 'vip_boat' ? 'boat' : r.id === 'auto_reel' ? 'gear' : r.id === 'sell_x2' ? 'coin' : r.id === 'bait_belt' ? 'bait' : 'blogem'" class="row__icon" />
          <div class="row__main">
            <strong>{{ r.p!.name }}</strong>
            <small class="wrap">{{ r.p!.description }}</small>
            <small v-if="r.p!.kind === 'consumable' && units(r.id) > 0" class="have">{{ t("shop.units", { n: units(r.id) }) }}</small>
          </div>
          <template v-if="r.p!.kind === 'permanent' && owns(r.id)">
            <button v-if="r.id === 'auto_reel'" type="button" class="pill" :class="{ 'pill--blue': store.me?.auto }" @click="setAuto(!store.me?.auto)">
              {{ store.me?.auto ? t("shop.auto_on") : t("shop.auto_off") }}
            </button>
            <button v-else-if="PAID_SKIN[r.id] && store.me?.skin !== PAID_SKIN[r.id]" type="button" class="pill" @click="equip('skin', PAID_SKIN[r.id]!)">{{ t("shop.equip") }}</button>
            <button v-else-if="r.id === 'vip_boat' && store.me?.boat !== 3" type="button" class="pill" @click="equip('boat', 'yacht')">{{ t("shop.equip") }}</button>
            <button v-else type="button" class="pill pill--blue" disabled>{{ t("shop.owned") }}</button>
          </template>
          <button v-else type="button" class="pill pill--gem" @click="buyPaid(r.id)"><Icon name="blogem" />{{ r.p!.priceBlogems }}</button>
        </article>
        <p v-if="!blogemRows.length" class="note">{{ t("shop.resting") }}</p>
      </template>
      <template v-else>
        <article class="row">
          <Icon name="rod" class="row__icon" />
          <div class="row__main"><strong>{{ t("rod." + (RODS[store.me?.rod ?? 0]?.id ?? "twig")) }}</strong></div>
          <button type="button" class="pill" :class="{ 'pill--blue': !store.me?.skin }" @click="equip('skin', '')">{{ !store.me?.skin ? t("hud.equipped") : t("hud.equip") }}</button>
        </article>
        <article v-for="skin in SKINS" :key="skin" class="row" :class="{ dim: !store.me?.skins.includes(skin) }">
          <Icon name="sparkle" class="row__icon" />
          <div class="row__main"><strong>{{ t("skin." + skin) }}</strong></div>
          <button v-if="store.me?.skin === skin" type="button" class="pill pill--blue" disabled>{{ t("hud.equipped") }}</button>
          <button v-else-if="store.me?.skins.includes(skin)" type="button" class="pill" @click="equip('skin', skin)">{{ t("hud.equip") }}</button>
          <button v-else type="button" class="pill" disabled><Icon name="lock" /></button>
        </article>
      </template>
    </div>
  </section>
</template>

<style scoped>
.shop {
  width: 1000px;
}
.shop__coins {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  color: #ffe27a;
}
.shop__coins :deep(.icon) {
  width: 60px;
  height: 60px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row__icon {
  width: 76px !important;
  height: 76px !important;
}
.row.dim {
  opacity: 0.6;
}
.row.sel {
  border-color: #5fff8a;
}
.have {
  color: #9fe9ff;
}
.note {
  margin: 0;
  color: #cfe0ee;
}
.wrap {
  white-space: normal !important;
}
.row--lucky {
  border-left-color: #c07aff;
  background: #2e2a5a;
}
.pill--gem {
  background: linear-gradient(#d6a8ff, #8a4ae0);
}
.pill--video {
  background: linear-gradient(#ffe27a, #ff9a3c);
  color: #3a2000;
  -webkit-text-stroke: 0;
}
</style>
