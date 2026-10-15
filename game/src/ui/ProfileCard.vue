<script setup lang="ts">
// Your angler card: level, stats, streak and the title shown above your head.
import { computed } from "vue"
import type { IGame } from "@blombo/game-runtime"
import { t } from "@/text"
import Icon from "./Icon.vue"
import { store } from "../net"
import { ACHIEVEMENTS, ZONES, levelOf } from "../../server/rules.ts"
import { num } from "./format"

const props = defineProps<{ game: IGame }>()
const emit = defineEmits<{ close: [] }>()
const level = computed(() => levelOf(store.me?.xp ?? 0))
const name = computed(() => props.game.players.find((p) => p.userId === store.userId)?.name ?? "")
/** Every title, earned ones first, in the order they are earned. */
const titles = computed(() => {
  const have = new Set(store.me?.titles ?? [])
  const all = [...new Set([...ACHIEVEMENTS.map((a) => a.title), ...ZONES.map((z) => "master_" + z.key)])]
  return all.map((id) => ({ id, have: have.has(id) })).sort((a, b) => Number(b.have) - Number(a.have))
})

function equip(id: string): void {
  props.game.remotes.send("Equip", { kind: "title", id })
}
</script>

<template>
  <section class="ui-group ui-group--center card profile" role="dialog" aria-labelledby="profile-title">
    <header class="card__head">
      <Icon name="level" class="card__icon" />
      <h1 id="profile-title">{{ name || t("card.profile") }}</h1>
      <button type="button" class="card__close" :aria-label="t('hud.close')" @click="emit('close')"><Icon name="close" /></button>
    </header>
    <div class="card__content list" tabindex="-1">
      <div class="profile__top">
        <span class="lvl"><Icon name="level" /><b>{{ level.level }}</b></span>
        <div class="profile__info">
          <strong>{{ store.me?.title ? t("title." + store.me.title) : t("profile.no_title") }}</strong>
          <span class="bar"><span :style="{ width: Math.round((level.into / level.need) * 100) + '%' }"></span></span>
          <small>{{ num(level.into) }} / {{ num(level.need) }}</small>
        </div>
      </div>
      <p class="stats">{{ t("profile.stats", { c: num(store.me?.catches ?? 0), p: num(store.me?.perfect ?? 0), s: num(store.me?.sold ?? 0) }) }}</p>
      <p v-if="(store.me?.streak ?? 0) > 0" class="stats">{{ t("profile.streak", { n: store.me?.streak ?? 0 }) }}</p>
      <h2 class="sub">{{ t("profile.titles") }}</h2>
      <article class="row" :class="{ sel: !store.me?.title }">
        <Icon name="star" class="row__icon" />
        <div class="row__main"><strong>{{ t("profile.no_title") }}</strong></div>
        <button v-if="!store.me?.title" type="button" class="pill pill--blue" disabled>{{ t("hud.equipped") }}</button>
        <button v-else type="button" class="pill" @click="equip('')">{{ t("hud.equip") }}</button>
      </article>
      <article v-for="ti in titles" :key="ti.id" class="row" :class="{ sel: store.me?.title === ti.id, dim: !ti.have }">
        <Icon :name="ti.have ? 'trophy' : 'lock'" class="row__icon" />
        <div class="row__main"><strong>{{ t("title." + ti.id) }}</strong></div>
        <button v-if="store.me?.title === ti.id" type="button" class="pill pill--blue" disabled>{{ t("hud.equipped") }}</button>
        <button v-else-if="ti.have" type="button" class="pill" @click="equip(ti.id)">{{ t("hud.equip") }}</button>
      </article>
    </div>
  </section>
</template>

<style scoped>
.profile {
  width: 900px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.profile__top {
  display: flex;
  align-items: center;
  gap: 18px;
}
.lvl {
  position: relative;
  flex: none;
  width: 140px;
  height: 140px;
}
.lvl :deep(.icon) {
  width: 140px;
  height: 140px;
}
.lvl b {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding-top: 52px;
  font-size: 56px;
}
.profile__info {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 6px;
  min-width: 0;
}
.profile__info strong {
  color: #ffe27a;
}
.profile__info small {
  color: #b8d0e4;
}
.bar {
  height: 26px;
  border: 4px solid #0b1a2a;
  border-radius: 14px;
  background: #0b1a2a;
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #4fb0ff, #9ff0ff);
}
.stats {
  margin: 0;
  color: #cfe0ee;
}
.sub {
  margin: 8px 0 0;
  font-size: 52px;
  color: #ffe27a;
}
.row__icon {
  width: 76px !important;
  height: 76px !important;
}
.row.sel {
  border-color: #5fff8a;
}
.row.dim {
  opacity: 0.55;
}
</style>
