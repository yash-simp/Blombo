<script setup lang="ts">
// Grandpa Reed's request, three daily quests, the live tournament board and earned titles.
import { computed, ref } from "vue"
import type { IGame } from "@blombo/game-runtime"
import { t } from "@/text"
import Icon from "./Icon.vue"
import FishIcon from "./FishIcon.vue"
import { store } from "../net"
import { ACHIEVEMENTS, DAILY_POOL, dailyScale, guideQuest, levelOf, tourneyAt } from "../../server/rules.ts"
import { baitName, clock, fishName, goalText, num } from "./format"
import { serverNow } from "../sky"

const props = defineProps<{ game: IGame }>()
const emit = defineEmits<{ close: [] }>()
const tab = ref<"quests" | "tourney" | "titles">(store.tourney?.live ? "tourney" : "quests")
const quest = computed(() => (store.quests ? guideQuest(store.quests.q) : null))
const scale = computed(() => dailyScale(levelOf(store.me?.xp ?? 0).level))
const dailies = computed(() => (store.quests?.d ?? []).map((d, i) => ({ ...d, i, def: DAILY_POOL.find((x) => x.id === d.id) })))
const tour = computed(() => tourneyAt(serverNow()))
function claim(i: number): void {
  props.game.remotes.send("Claim", { kind: "daily", id: i })
}
</script>

<template>
  <section class="ui-group ui-group--center card quests" role="dialog" aria-labelledby="quests-title">
    <header class="card__head">
      <Icon name="scroll" class="card__icon" />
      <h1 id="quests-title">{{ t("card.quests") }}</h1>
      <button type="button" class="card__close" :aria-label="t('hud.close')" @click="emit('close')"><Icon name="close" /></button>
    </header>
    <div class="tabs">
      <button type="button" :class="{ on: tab === 'quests' }" @click="tab = 'quests'">{{ t("card.quests") }}</button>
      <button type="button" :class="{ on: tab === 'tourney' }" @click="tab = 'tourney'">{{ t("hud.tourney_board") }}</button>
      <button type="button" :class="{ on: tab === 'titles' }" @click="tab = 'titles'">{{ t("quest.achievements") }}</button>
    </div>
    <div class="card__content list" tabindex="-1">
      <template v-if="tab === 'quests'">
        <h2 class="sub">{{ t("quest.guide") }}</h2>
        <article v-if="quest && store.quests" class="row row--gold">
          <Icon name="scroll" class="row__icon" />
          <div class="row__main">
            <strong class="wrap">{{ goalText(quest.goal) }}</strong>
            <small v-if="store.quests.qn > 1">{{ t("hud.progress", { n: store.quests.qp, t: store.quests.qn }) }}</small>
            <small>
              <template v-if="quest.reward.coins">{{ t("reward.coins", { n: num(quest.reward.coins) }) }} </template>
              <template v-if="quest.reward.bait">{{ t("reward.bait", { n: quest.reward.baitN ?? 0, bait: baitName(quest.reward.bait) }) }}</template>
            </small>
          </div>
        </article>
        <h2 class="sub">{{ t("quest.daily") }}</h2>
        <article v-for="d in dailies" :key="d.id" class="row" :class="{ done: d.claimed }">
          <Icon :name="d.claimed ? 'star' : 'scroll'" class="row__icon" />
          <div class="row__main">
            <strong class="wrap">{{ d.def ? goalText(d.def.goal) : d.id }}</strong>
            <small>{{ t("hud.progress", { n: d.p, t: d.n }) }} · {{ t("reward.coins", { n: num(Math.round((d.def?.coins ?? 0) * scale)) }) }}</small>
          </div>
          <button v-if="d.claimed" type="button" class="pill pill--blue" disabled>{{ t("hud.claimed") }}</button>
          <button v-else type="button" class="pill pill--gold" :disabled="!d.done" @click="claim(d.i)">{{ t("hud.claim") }}</button>
        </article>
      </template>
      <template v-else-if="tab === 'tourney'">
        <p class="sub">
          <Icon name="trophy" class="inline" />{{
            store.tourney?.live ? t("hud.tourney_live", { time: clock(tour.endsAt - serverNow()) }) : t("hud.tourney_soon", { time: clock(tour.startsAt - serverNow()) })
          }}
        </p>
        <p class="note">{{ t("npc.say.host") }}</p>
        <article v-for="(e, i) in store.tourney?.board ?? []" :key="e.u" class="row" :class="{ me: e.u === store.userId }">
          <b class="rank">{{ i + 1 }}</b>
          <Icon v-if="e.u === store.tourney?.crown" name="crown" class="row__icon" />
          <FishIcon :species="e.sp" class="row__fish" />
          <div class="row__main">
            <strong>{{ e.n }}</strong>
            <small>{{ fishName(e.sp) }} · {{ t("hud.size_pct", { pct: e.s }) }}</small>
          </div>
        </article>
        <p v-if="!(store.tourney?.board ?? []).length" class="note">{{ t("hud.tourney_empty") }}</p>
      </template>
      <template v-else>
        <article v-for="a in ACHIEVEMENTS" :key="a.id" class="row" :class="{ done: store.quests?.ach.includes(a.id) }">
          <Icon :name="store.quests?.ach.includes(a.id) ? 'trophy' : 'lock'" class="row__icon" />
          <div class="row__main">
            <strong>{{ t("title." + a.title) }}</strong>
          </div>
        </article>
      </template>
    </div>
  </section>
</template>

<style scoped>
.quests {
  width: 1000px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sub {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0 0;
  font-size: 52px;
  color: #ffe27a;
}
.note {
  margin: 0;
  color: #cfe0ee;
}
.inline {
  width: 60px !important;
  height: 60px !important;
}
.wrap {
  white-space: normal !important;
}
.row__icon {
  width: 76px !important;
  height: 76px !important;
}
.row__fish {
  width: 116px;
  height: 116px;
  margin: -18px -4px;
}
.row--gold {
  border-left-color: #ffbf3a;
  background: #3a3a1a;
}
.row.done {
  opacity: 0.75;
}
.row.me {
  border-left-color: #ffe27a;
}
.rank {
  width: 60px;
  text-align: center;
  font-size: 56px;
  color: #ffe27a;
}
</style>
