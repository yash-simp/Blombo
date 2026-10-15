<script setup lang="ts">
// Illustrated colour icons (SVG, outlined, Roblox-style). Decorative unless a label is given.
defineProps<{ name: string; label?: string }>()
</script>

<template>
  <svg viewBox="0 0 64 64" class="icon" :role="label ? 'img' : undefined" :aria-label="label" :aria-hidden="label ? undefined : 'true'">
    <g v-if="name === 'coin'" stroke="#7a4a00" stroke-width="4" stroke-linejoin="round">
      <circle cx="32" cy="32" r="25" fill="#ffc83a" />
      <circle cx="32" cy="32" r="16" fill="#ffe27a" stroke-width="3" />
      <path d="M32 22v20M26 27h9a4 4 0 0 1 0 8h-6a4 4 0 0 0 0 8h9" fill="none" stroke="#b77a00" stroke-width="3.5" stroke-linecap="round" />
    </g>
    <g v-else-if="name === 'fish'" stroke="#123a5a" stroke-width="4" stroke-linejoin="round">
      <path d="M8 32c8-12 24-16 36-8l10-8v32l-10-8c-12 8-28 4-36-8z" fill="#5ac8ff" />
      <path d="M18 26c6-4 14-5 20-2" fill="none" stroke="#c8f0ff" stroke-width="3" stroke-linecap="round" />
      <circle cx="18" cy="30" r="3" fill="#123a5a" stroke="none" />
    </g>
    <g v-else-if="name === 'bag'" stroke="#4a2a10" stroke-width="4" stroke-linejoin="round">
      <path d="M14 24h36l-4 30H18z" fill="#c8843a" />
      <path d="M22 24c0-12 20-12 20 0" fill="none" />
      <path d="M22 36c6 4 14 4 20 0" fill="none" stroke="#ffd27a" stroke-width="3" stroke-linecap="round" />
    </g>
    <g v-else-if="name === 'book'" stroke="#1e2a5a" stroke-width="4" stroke-linejoin="round">
      <path d="M10 14c8-4 16-4 22 2v36c-6-6-14-6-22-2z" fill="#6f8bff" />
      <path d="M54 14c-8-4-16-4-22 2v36c6-6 14-6 22-2z" fill="#8aa2ff" />
      <path d="M38 26c4-2 8-2 11 0M38 34c4-2 8-2 11 0" stroke="#e6ecff" stroke-width="3" stroke-linecap="round" fill="none" />
    </g>
    <g v-else-if="name === 'map'" stroke="#2a3a10" stroke-width="4" stroke-linejoin="round">
      <path d="M8 16l16-6 16 6 16-6v38l-16 6-16-6-16 6z" fill="#7fd06a" />
      <path d="M24 10v38M40 16v38" fill="none" />
      <path d="M44 26l4 4m0-4l-4 4" stroke="#e8463a" stroke-width="3.5" stroke-linecap="round" />
      <path d="M14 38c4-4 8 2 12-2" fill="none" stroke="#3fa7ff" stroke-width="3" />
    </g>
    <g v-else-if="name === 'star'" stroke="#7a4a00" stroke-width="4" stroke-linejoin="round">
      <path d="M32 6l7.6 16 17.4 2.2-12.8 12 3.4 17.4L32 45l-15.6 8.6 3.4-17.4L7 24.2 24.4 22z" fill="#ffd34d" />
    </g>
    <g v-else-if="name === 'gift'" stroke="#2a1a4a" stroke-width="4" stroke-linejoin="round">
      <rect x="10" y="26" width="44" height="28" rx="4" fill="#ff6fa8" />
      <rect x="7" y="18" width="50" height="11" rx="4" fill="#ff8fc0" />
      <path d="M32 18v36" stroke="#ffd34d" stroke-width="8" />
      <path d="M32 18c-6-10-18-8-14-1 2 2 8 2 14 1zM32 18c6-10 18-8 14-1-2 2-8 2-14 1z" fill="#ffd34d" />
    </g>
    <g v-else-if="name === 'scroll'" stroke="#5a3a10" stroke-width="4" stroke-linejoin="round">
      <path d="M16 10h32v40a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6v-6h8z" fill="#ffe8b0" />
      <path d="M48 10a6 6 0 0 1 6 6v4h-6" fill="#f0c878" />
      <path d="M22 22h20M22 30h20M22 38h14" stroke="#b07a3a" stroke-width="3" stroke-linecap="round" />
    </g>
    <g v-else-if="name === 'shop'" stroke="#3a1a10" stroke-width="4" stroke-linejoin="round">
      <path d="M8 26l6-14h36l6 14z" fill="#ff7a5a" />
      <path d="M8 26c0 5 8 5 8 0 0 5 8 5 8 0 0 5 8 5 8 0 0 5 8 5 8 0 0 5 8 5 8 0 0 5 8 5 8 0" fill="#fff1d6" />
      <rect x="12" y="32" width="40" height="22" fill="#ffd27a" />
      <rect x="26" y="38" width="12" height="16" fill="#8a5a33" />
    </g>
    <g v-else-if="name === 'rod'" stroke="#3a2010" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 54L52 10" stroke="#a8743a" stroke-width="6" />
      <path d="M52 10c4 10 4 22 0 34" fill="none" stroke="#e6f4ff" stroke-width="2.5" />
      <circle cx="52" cy="46" r="5" fill="#e8463a" />
      <circle cx="20" cy="46" r="6" fill="#9aa4b4" />
    </g>
    <g v-else-if="name === 'crown'" stroke="#7a4a00" stroke-width="4" stroke-linejoin="round">
      <path d="M8 22l12 12 12-20 12 20 12-12-6 28H14z" fill="#ffc83a" />
      <circle cx="32" cy="38" r="4" fill="#e8463a" />
    </g>
    <g v-else-if="name === 'worm'" stroke="#5a1a2a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 44c6-12 14 8 20-4s14 8 22-6" fill="none" stroke="#ff8aa8" stroke-width="10" />
      <path d="M10 44c6-12 14 8 20-4s14 8 22-6" fill="none" stroke="#ffb3c7" stroke-width="3" />
      <circle cx="52" cy="34" r="2" fill="#5a1a2a" />
    </g>
    <g v-else-if="name === 'boat'" stroke="#2a1a10" stroke-width="4" stroke-linejoin="round">
      <path d="M6 38h52l-8 14H14z" fill="#c8843a" />
      <path d="M32 8v30" />
      <path d="M32 10l18 24H32z" fill="#fff6e8" />
      <path d="M30 14L16 34h14z" fill="#e8463a" />
    </g>
    <g v-else-if="name === 'gear'" stroke="#1a2a3a" stroke-width="4" stroke-linejoin="round">
      <path d="M28 6h8l2 7 6 3 7-3 5 6-3 7 3 6 7 2v8l-7 2-3 6 3 7-6 5-7-3-6 3-2 7h-8l-2-7-6-3-7 3-5-6 3-7-3-6-7-2v-8l7-2 3-6-3-7 6-5 7 3 6-3z" fill="#9fb4c8" />
      <circle cx="32" cy="32" r="8" fill="#e6f0f8" />
    </g>
    <g v-else-if="name === 'lock'" stroke="#2a2a3a" stroke-width="4" stroke-linejoin="round">
      <path d="M20 28v-8a12 12 0 0 1 24 0v8" fill="none" />
      <rect x="14" y="28" width="36" height="26" rx="5" fill="#ffc83a" />
      <circle cx="32" cy="40" r="4" fill="#2a2a3a" />
    </g>
    <g v-else-if="name === 'sparkle'" stroke="#7a4a00" stroke-width="3" stroke-linejoin="round">
      <path d="M32 6l5 21 21 5-21 5-5 21-5-21-21-5 21-5z" fill="#fff3a0" />
      <path d="M50 8l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" fill="#ffffff" />
    </g>
    <g v-else-if="name === 'trophy'" stroke="#7a4a00" stroke-width="4" stroke-linejoin="round">
      <path d="M18 8h28v14a14 14 0 0 1-28 0z" fill="#ffc83a" />
      <path d="M18 14H8c0 10 6 14 12 14M46 14h10c0 10-6 14-12 14" fill="none" />
      <path d="M28 36h8v8h6v10H22V44h6z" fill="#e8a83a" />
    </g>
    <g v-else-if="name === 'video'" stroke="#1a3a1a" stroke-width="4" stroke-linejoin="round">
      <rect x="6" y="14" width="52" height="36" rx="9" fill="#5fdc6a" />
      <path d="M27 23l14 9-14 9z" fill="#ffffff" />
    </g>
    <g v-else-if="name === 'close'" stroke="#ffffff" stroke-width="7" stroke-linecap="round">
      <path d="M18 18l28 28M46 18L18 46" />
    </g>
    <g v-else-if="name === 'arrow'" stroke="#1a2a3a" stroke-width="4" stroke-linejoin="round">
      <path d="M32 6l20 22H40v28H24V28H12z" fill="#ffd34d" />
    </g>
    <g v-else-if="name === 'clock'" stroke="#1a2a3a" stroke-width="4" stroke-linejoin="round">
      <circle cx="32" cy="32" r="24" fill="#e6f0f8" />
      <path d="M32 18v15l10 6" fill="none" stroke-linecap="round" />
    </g>
    <g v-else-if="name === 'level'" stroke="#1a2a5a" stroke-width="4" stroke-linejoin="round">
      <path d="M32 4l24 12v24c0 10-12 16-24 20C20 56 8 50 8 40V16z" fill="#6f8bff" />
      <path d="M32 18l4.5 9 10 1.5-7.2 7 1.7 10L32 41l-9 4.5 1.7-10-7.2-7 10-1.5z" fill="#ffd34d" stroke-width="3" />
    </g>
    <g v-else-if="name === 'blogem'" stroke="#1a2a5a" stroke-width="4" stroke-linejoin="round">
      <path d="M16 8h32l12 16-28 34L4 24z" fill="#5ad0ff" />
      <path d="M4 24h56M24 8l-6 16 14 34 14-34-6-16" fill="none" stroke-width="3" />
    </g>
    <g v-else-if="name === 'home'" stroke="#2a1a10" stroke-width="4" stroke-linejoin="round">
      <path d="M8 30L32 10l24 20v24H8z" fill="#ffd27a" />
      <path d="M4 32L32 8l28 24" fill="none" stroke="#c0503a" stroke-width="6" stroke-linecap="round" />
      <rect x="26" y="38" width="12" height="16" fill="#8a5a33" />
    </g>
    <g v-else-if="name === 'sun'" stroke="#7a4a00" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
      <path d="M32 4v8M32 52v8M4 32h8M52 32h8M12 12l6 6M46 46l6 6M12 52l6-6M46 18l6-6" />
      <circle cx="32" cy="32" r="13" fill="#ffd34d" />
    </g>
    <g v-else-if="name === 'sunset'" stroke="#5a2a10" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
      <path d="M14 40a18 18 0 0 1 36 0z" fill="#ff9a4a" />
      <path d="M6 40h52M12 48h40M20 56h24" />
      <path d="M32 8v8M12 18l5 5M52 18l-5 5" />
    </g>
    <g v-else-if="name === 'moon'" stroke="#1a2a5a" stroke-width="4" stroke-linejoin="round">
      <path d="M40 6a26 26 0 1 0 18 40A22 22 0 0 1 40 6z" fill="#fff3a0" />
      <circle cx="18" cy="14" r="2" fill="#fff" stroke="none" />
      <circle cx="10" cy="28" r="1.5" fill="#fff" stroke="none" />
    </g>
    <g v-else-if="name === 'rain'" stroke="#1a2a3a" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
      <path d="M16 36a10 10 0 0 1 2-20 14 14 0 0 1 26 2 9 9 0 0 1 4 18z" fill="#cfe0ee" />
      <path d="M22 44l-3 8M34 44l-3 8M46 44l-3 8" stroke="#3fa7ff" />
    </g>
    <g v-else-if="name === 'fog'" stroke="#1a2a3a" stroke-width="4" stroke-linecap="round">
      <path d="M8 22h40M14 32h44M6 42h36M18 52h30" stroke="#b8c8d8" stroke-width="7" />
    </g>
    <g v-else-if="name === 'storm'" stroke="#1a1a2a" stroke-width="4" stroke-linejoin="round">
      <path d="M14 34a10 10 0 0 1 2-20 14 14 0 0 1 26 2 9 9 0 0 1 4 18z" fill="#7a8aa0" />
      <path d="M34 34l-8 12h8l-4 12 12-16h-8l4-8z" fill="#ffe27a" />
    </g>
    <g v-else-if="name === 'aurora'" stroke="#1a2a3a" stroke-width="3" stroke-linejoin="round">
      <path d="M4 40c10-20 18-20 28-8s18 12 28-8v14c-10 20-18 20-28 8S14 34 4 54z" fill="#7affc0" />
      <path d="M4 28c10-14 18-14 28-4s18 10 28-6" fill="none" stroke="#c07aff" stroke-width="5" />
    </g>
    <g v-else-if="name === 'bait'" stroke="#5a1a2a" stroke-width="4" stroke-linejoin="round">
      <circle cx="32" cy="34" r="20" fill="#ffd27a" />
      <path d="M22 34c4-8 8 8 12 0s8 8 10 0" fill="none" stroke="#ff7a9a" stroke-width="5" stroke-linecap="round" />
    </g>
    <g v-else stroke="#1a2a3a" stroke-width="4"><circle cx="32" cy="32" r="22" fill="#9fb4c8" /></g>
  </svg>
</template>

<style scoped>
.icon {
  display: block;
  width: 1em;
  height: 1em;
  flex: none;
  overflow: visible;
}
</style>
