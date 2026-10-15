// Graphics quality. "high" draws the full world; "low" (slow phones) shortens the draw distances,
// drops prop shadows and fireflies, uses a cheaper ground shader, and renders at a lower resolution. "auto" starts at the level this
// device last needed and steps down when the frame rate stays low.
import { reactive } from "vue"

export type QualityMode = "auto" | "high" | "low"
export type QualityLevel = "high" | "low"

export interface QualitySettings {
  /** Metres from the player within which small clutter (grass, flowers, pebbles) is drawn. */
  clutter: number
  /** Within this, chunks show full props; beyond, simplified trees and buildings only. */
  detail: number
  /** Within this, terrain chunks use the full-resolution mesh. */
  terrain: number
  /** Big props cast sun shadows. */
  shadows: boolean
  /** game.setRenderScale. */
  renderScale: number
  fireflies: boolean
  /** Terrain and paths use the cheap ground material (one detail sample, no anisotropic filtering). */
  cheapGround: boolean
}

export const LEVELS: Record<QualityLevel, QualitySettings> = {
  high: { clutter: 40, detail: 40, terrain: 70, shadows: true, renderScale: 1, fireflies: true, cheapGround: false },
  low: { clutter: 24, detail: 26, terrain: 40, shadows: false, renderScale: 0.75, fireflies: false, cheapGround: true },
}

/** Average frame rate below which auto mode switches to low (two windows in a row). */
const SLOW_FPS = 42
const WINDOW_S = 4
const WARMUP_S = 6
const STORE_MODE = "ll:quality"
const STORE_AUTO_LOW = "ll:quality:autolow"

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* private mode: the choice lasts this session */
  }
}

const savedMode = read(STORE_MODE)
const mode: QualityMode = savedMode === "high" || savedMode === "low" ? savedMode : "auto"

export const quality = reactive({
  mode,
  level: (mode === "auto" ? (read(STORE_AUTO_LOW) === "1" ? "low" : "high") : mode) as QualityLevel,
  /** Last measured frames per second (for the profile card). */
  fps: 0,
})

export function settings(): QualitySettings {
  return LEVELS[quality.level]
}

export function setQualityMode(next: QualityMode): void {
  quality.mode = next
  write(STORE_MODE, next === "auto" ? null : next)
  if (next !== "auto") quality.level = next
  else {
    write(STORE_AUTO_LOW, null)
    quality.level = "high"
  }
  slowWindows = 0
  elapsed = 0
  frames = 0
  warm = 0
}

let warm = 0
let elapsed = 0
let frames = 0
let slowWindows = 0

/** Feed every frame's dt; in auto mode a device that stays slow steps down to low (and remembers it). */
export function watchFrame(dt: number): void {
  if (dt <= 0 || dt > 1) return
  warm += dt
  if (warm < WARMUP_S) return
  elapsed += dt
  frames++
  if (elapsed < WINDOW_S) return
  quality.fps = Math.round(frames / elapsed)
  const slow = quality.fps < SLOW_FPS
  elapsed = 0
  frames = 0
  if (quality.mode !== "auto" || quality.level === "low") return
  slowWindows = slow ? slowWindows + 1 : 0
  if (slowWindows >= 2) {
    quality.level = "low"
    write(STORE_AUTO_LOW, "1")
  }
}
