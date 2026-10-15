// Mirror of the workspace's platform-owned tools/uiScale.ts (for local HUD screenshots only).
import { computed, onBeforeUnmount, onMounted, ref, type CSSProperties, type Ref } from "vue"
const SHELL_DESIGN_WIDTH = 1920
const UI_DESIGN_WIDTH = 2880
const UI_DESIGN_HEIGHT = 1620
const UI_MIN_SCALE = 14 / 48
const PORTRAIT_SHELL_DESIGN_WIDTH = 1080
const PORTRAIT_UI_DESIGN_WIDTH = 1620
const PORTRAIT_UI_DESIGN_HEIGHT = 2880
const PORTRAIT_CLEARANCE = { top: 140, bottom: 520 } as const
export function useGameUiScale(viewport: Ref<HTMLElement | null>) {
  const width = ref(0)
  const height = ref(0)
  let observer: ResizeObserver | undefined
  onMounted(() => {
    const element = viewport.value
    if (!element) return
    const measure = () => {
      width.value = element.clientWidth
      height.value = element.clientHeight
    }
    measure()
    observer = new ResizeObserver(measure)
    observer.observe(element)
  })
  onBeforeUnmount(() => observer?.disconnect())
  return computed<CSSProperties>(() => {
    const portrait = width.value > 0 && height.value >= width.value
    const shell = width.value / (portrait ? PORTRAIT_SHELL_DESIGN_WIDTH : SHELL_DESIGN_WIDTH)
    const fit = portrait
      ? Math.min(width.value / PORTRAIT_UI_DESIGN_WIDTH, height.value / PORTRAIT_UI_DESIGN_HEIGHT)
      : Math.min(width.value / UI_DESIGN_WIDTH, height.value / UI_DESIGN_HEIGHT)
    const scale = Math.min(shell, Math.max(fit, UI_MIN_SCALE))
    return {
      "--ui-scale": scale,
      "--shell-scale": shell,
      "--ui-height": `${scale > 0 ? height.value / scale : 0}px`,
      ...(portrait
        ? { "--clear-top": `${PORTRAIT_CLEARANCE.top}px`, "--clear-top-left": `${PORTRAIT_CLEARANCE.top}px`, "--clear-bottom": `${PORTRAIT_CLEARANCE.bottom}px` }
        : {}),
    }
  })
}
