// Local stand-in for the platform's text reader: the game's one locale file, {name} filled from params.
import { computed } from "vue"
import en from "../../game/locales/en.json"
const table = en as Record<string, string>
export function t(key: string, params?: Record<string, string | number>): string {
  const text = table[key]
  if (text === undefined) {
    ;(window as unknown as { __missing: Set<string> }).__missing?.add(key)
    return key
  }
  return text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, name: string) => (params && name in params ? String(params[name]) : m))
}
export const locale = computed(() => "en")
