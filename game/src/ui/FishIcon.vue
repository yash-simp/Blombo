<script setup lang="ts">
// An illustrated colour icon of one species: a CSS sprite from the fish atlas (pipeline/blender/fish_icons.py:
// 128 px cells, 8 columns, SPECIES order). The parent sets width/height. `unknown` draws a dark silhouette
// (species not caught yet); `shiny` adds a golden glow and twinkling sparkles.
import { computed } from "vue"
import { SPECIES } from "../../server/rules.ts"
import { assetUrl } from "../assets/gltf"

const COLS = 8
const ROWS = Math.ceil(SPECIES.length / COLS)
const SHEET = `url("${assetUrl("models/fish_icons.webp")}")`

const props = defineProps<{ species: number; shiny?: boolean; unknown?: boolean }>()
const sprite = computed(() => {
  const i = Math.max(0, Math.min(SPECIES.length - 1, Math.floor(props.species) || 0))
  const col = i % COLS
  const row = Math.floor(i / COLS)
  return {
    backgroundImage: SHEET,
    backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
    backgroundPosition: `${(col / (COLS - 1)) * 100}% ${ROWS > 1 ? (row / (ROWS - 1)) * 100 : 0}%`,
  }
})
</script>

<template>
  <span class="fish-icon" :class="{ 'fish-icon--shiny': shiny && !unknown, 'fish-icon--unknown': unknown }" aria-hidden="true">
    <span class="fish-icon__img" :style="sprite"></span>
    <template v-if="shiny && !unknown">
      <span v-for="k in 3" :key="k" class="fish-icon__spark" :class="'fish-icon__spark--' + k"></span>
    </template>
  </span>
</template>

<style scoped>
.fish-icon {
  position: relative;
  display: inline-block;
  flex: none;
  width: 96px;
  height: 96px;
  vertical-align: middle;
  pointer-events: none;
}
.fish-icon__img {
  position: absolute;
  inset: 0;
  background-repeat: no-repeat;
}
.fish-icon--unknown .fish-icon__img {
  filter: brightness(0);
  opacity: 0.55;
}
.fish-icon--shiny .fish-icon__img {
  filter: drop-shadow(0 0 6px #ffe27a) drop-shadow(0 0 3px #fff6c8) saturate(1.25) brightness(1.08);
}
.fish-icon__spark {
  position: absolute;
  width: 26%;
  height: 26%;
  background: linear-gradient(135deg, #ffffff, #ffe27a 60%, #ffb52e);
  clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%);
  animation: fish-twinkle 1.6s ease-in-out infinite;
}
.fish-icon__spark--1 {
  top: 2%;
  right: 6%;
}
.fish-icon__spark--2 {
  bottom: 8%;
  left: 4%;
  width: 18%;
  height: 18%;
  animation-delay: -0.55s;
}
.fish-icon__spark--3 {
  top: 18%;
  left: 22%;
  width: 14%;
  height: 14%;
  animation-delay: -1.1s;
}
@keyframes fish-twinkle {
  0%,
  100% {
    scale: 0.35;
    opacity: 0.2;
    rotate: 0deg;
  }
  50% {
    scale: 1;
    opacity: 1;
    rotate: 45deg;
  }
}
@media (prefers-reduced-motion: reduce) {
  .fish-icon__spark {
    animation: none;
  }
}
</style>
