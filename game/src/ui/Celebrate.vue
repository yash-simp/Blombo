<script setup lang="ts">
// Celebrations: one banner at a time (queued), coins flying into the counter, confetti.
import { onBeforeUnmount, ref } from "vue"
import Icon from "./Icon.vue"

export interface Banner {
  title: string
  lines: string[]
  icon: string
  color: string
  big?: boolean
}

const queue: Banner[] = []
const current = ref<Banner | null>(null)
const key = ref(0)
let timer = 0

function next(): void {
  current.value = queue.shift() ?? null
  key.value++
  if (current.value) timer = window.setTimeout(next, current.value.big ? 2600 : 2100)
}

function banner(b: Banner): void {
  queue.push(b)
  if (!current.value) next()
}

interface Coin {
  id: number
  x0: number
  y0: number
  x1: number
  y1: number
  delay: number
}
const coins = ref<Coin[]>([])
let coinId = 0

/** Coins burst from a point (viewport px) and fly to `target` (an element). */
function flyCoins(count: number, from: { x: number; y: number }, target: HTMLElement | null): void {
  if (!target) return
  const r = target.getBoundingClientRect()
  const layer = root.value?.getBoundingClientRect()
  const ox = layer?.left ?? 0
  const oy = layer?.top ?? 0
  for (let i = 0; i < Math.min(14, count); i++) {
    const c: Coin = {
      id: coinId++,
      x0: from.x - ox + (Math.random() - 0.5) * 140,
      y0: from.y - oy + (Math.random() - 0.5) * 80,
      x1: r.left - ox + r.width * 0.25,
      y1: r.top - oy + r.height / 2,
      delay: i * 45,
    }
    coins.value.push(c)
    window.setTimeout(() => (coins.value = coins.value.filter((x) => x.id !== c.id)), 1100 + c.delay)
  }
}

const canvas = ref<HTMLCanvasElement | null>(null)
const root = ref<HTMLElement | null>(null)
let raf = 0
interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  vr: number
  c: string
  w: number
}
let pieces: Piece[] = []
function confetti(amount = 120): void {
  const el = canvas.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  el.width = rect.width
  el.height = rect.height
  const colors = ["#ff5f7a", "#ffd34d", "#5fdc6a", "#4fb0ff", "#c07aff", "#ffffff"]
  for (let i = 0; i < amount; i++) {
    pieces.push({
      x: rect.width * (0.2 + Math.random() * 0.6),
      y: rect.height * 0.35,
      vx: (Math.random() - 0.5) * rect.width * 0.9,
      vy: -rect.height * (0.4 + Math.random() * 0.6),
      r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 12,
      c: colors[i % colors.length]!,
      w: Math.max(6, rect.width * 0.008) * (0.6 + Math.random() * 0.8),
    })
  }
  if (!raf) {
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const ctx = el.getContext("2d")!
      ctx.clearRect(0, 0, el.width, el.height)
      pieces = pieces.filter((p) => p.y < el.height + 40)
      for (const p of pieces) {
        p.vy += el.height * 1.1 * dt
        p.vx *= 0.99
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.r += p.vr * dt
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.r)
        ctx.fillStyle = p.c
        ctx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2)
        ctx.restore()
      }
      raf = pieces.length ? requestAnimationFrame(step) : 0
      if (!raf) ctx.clearRect(0, 0, el.width, el.height)
    }
    raf = requestAnimationFrame(step)
  }
}

onBeforeUnmount(() => {
  window.clearTimeout(timer)
  cancelAnimationFrame(raf)
})

defineExpose({ banner, flyCoins, confetti })
</script>

<template>
  <div ref="root" class="celebrate">
    <canvas ref="canvas" class="celebrate__confetti"></canvas>
    <div v-if="current" :key="key" class="ui-group ui-group--center celebrate__group">
      <div class="banner" :class="{ 'banner--big': current.big }" :style="{ '--bc': current.color }">
        <div class="banner__icon"><Icon :name="current.icon" /></div>
        <h2 class="banner__title">{{ current.title }}</h2>
        <p v-for="(line, i) in current.lines" :key="i" class="banner__line">{{ line }}</p>
      </div>
    </div>
    <div
      v-for="c in coins"
      :key="c.id"
      class="coin"
      :style="{ '--x0': c.x0 + 'px', '--y0': c.y0 + 'px', '--x1': c.x1 + 'px', '--y1': c.y1 + 'px', animationDelay: c.delay + 'ms' }"
    >
      <Icon name="coin" />
    </div>
  </div>
</template>

<style scoped>
.celebrate {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.celebrate__confetti {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.celebrate__group {
  pointer-events: none;
}
.banner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 620px;
  max-width: 900px;
  padding: 26px 48px 30px;
  border: 7px solid #0b1a2a;
  border-radius: 36px;
  background: linear-gradient(180deg, var(--bc), color-mix(in srgb, var(--bc) 55%, #0b1a2a));
  box-shadow: 0 12px 0 #0b1a2a, 0 0 60px color-mix(in srgb, var(--bc) 70%, transparent);
  translate: 0 calc(-1 * clamp(80px, var(--ui-height, 1620px) * 0.5 - 520px, 330px));
  animation: bannerIn 0.45s cubic-bezier(0.2, 1.7, 0.4, 1), bannerOut 0.35s ease-in 1.75s forwards;
  text-align: center;
}
.banner--big {
  animation: bannerIn 0.5s cubic-bezier(0.2, 1.7, 0.4, 1), bannerOut 0.35s ease-in 2.25s forwards;
}
.banner__icon {
  margin-top: -90px;
  width: 140px;
  height: 140px;
  animation: spin 1.2s ease-out;
}
.banner__icon :deep(.icon) {
  width: 140px;
  height: 140px;
  filter: drop-shadow(0 6px 0 rgb(0 0 0 / 35%));
}
.banner__title {
  margin: 0;
  font-size: 78px;
  line-height: 1;
  color: #fff;
}
.banner--big .banner__title {
  font-size: 104px;
}
.banner__line {
  margin: 0;
  font-size: 48px;
  color: #fff7d6;
}
.coin {
  position: absolute;
  left: 0;
  top: 0;
  width: 34px;
  height: 34px;
  animation: fly 0.95s cubic-bezier(0.5, 0, 0.8, 0.6) both;
}
.coin :deep(.icon) {
  width: 100%;
  height: 100%;
}
@keyframes fly {
  0% {
    transform: translate(var(--x0), var(--y0)) scale(0.4);
    opacity: 0;
  }
  20% {
    transform: translate(calc(var(--x0) + 10px), calc(var(--y0) - 60px)) scale(1.3);
    opacity: 1;
  }
  100% {
    transform: translate(var(--x1), var(--y1)) scale(0.8);
    opacity: 1;
  }
}
@keyframes bannerIn {
  from {
    scale: 0.3;
    opacity: 0;
  }
}
@keyframes bannerOut {
  to {
    scale: 0.8;
    opacity: 0;
  }
}
@keyframes spin {
  from {
    rotate: -200deg;
    scale: 0.3;
  }
}
</style>
