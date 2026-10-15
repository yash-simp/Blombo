// Formatting and goal text for the HUD (text comes from locales/en.json through t()).
import { locale, t } from "@/text"
import { BAITS, type Goal, REELS, RODS, SPECIES, ZONES, guideQuest } from "../../server/rules.ts"

export const RARITY_CSS = ["#c9d3dc", "#6fe07a", "#4fb0ff", "#c07aff", "#ffbf3a", "#ff5fae"]

export function num(n: number): string {
  return Math.floor(n).toLocaleString(locale.value)
}

export function shortNum(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M"
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "K"
  return num(n)
}

export function kg(grams: number): string {
  const v = grams / 1000
  return v.toLocaleString(locale.value, { maximumFractionDigits: v < 10 ? 2 : 1 })
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return t("hud.time_left", { m, s: String(s % 60).padStart(2, "0") })
}

export function fishName(species: number): string {
  const s = SPECIES[species]
  return s ? t("fish." + s.id) : t("hud.unknown")
}

export function zoneName(zone: number): string {
  const z = ZONES[zone]
  return z ? t("zone." + z.key) : ""
}

export function baitName(id: string): string {
  return t("bait." + id)
}

/** The sentence for a quest goal (one locale text with placeholders). */
export function goalText(goal: Goal): string {
  switch (goal.k) {
    case "catch":
      if (goal.zone !== undefined && goal.rarity !== undefined)
        return t("quest.catch_zone_rarity", { n: goal.n, zone: zoneName(goal.zone), rarity: t("rarity." + goal.rarity) })
      if (goal.zone !== undefined) return t("quest.catch_zone", { n: goal.n, zone: zoneName(goal.zone) })
      if (goal.rarity !== undefined) return t("quest.catch_rarity", { n: goal.n, rarity: t("rarity." + goal.rarity) })
      return t("quest.catch", { n: goal.n })
    case "sell":
      return t("quest.sell", { n: goal.n })
    case "rod":
      return t("quest.rod", { rod: t("rod." + (RODS[goal.i]?.id ?? "twig")) })
    case "reel":
      return t("quest.reel", { reel: t("reel." + (REELS[goal.i]?.id ?? "basic")) })
    case "index":
      return t("quest.index", { n: goal.n })
    case "level":
      return t("quest.level", { n: goal.n })
    case "zone":
      return t("quest.zone", { zone: zoneName(goal.i) })
    case "perfect":
      return t("quest.perfect", { n: goal.n })
    case "weather":
      return t("quest.weather", { weather: t("weather." + goal.w) })
    case "night":
      return t("quest.night", { n: goal.n })
    case "aquarium":
      return t("quest.aquarium")
    case "tourney":
      return t("quest.tourney")
    case "indexZone":
      return t("quest.indexZone")
    default:
      return ""
  }
}

export function questGoal(index: number): Goal {
  return guideQuest(index).goal
}

export function baitDef(id: string) {
  return BAITS.find((b) => b.id === id)
}
