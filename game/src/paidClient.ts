// Blogem purchases and rewarded videos for the HUD: one bindPaid for the whole game (src/paid.ts is the
// example's protocol, unchanged). The server decides every benefit; this only shows and asks.
import { reactive } from "vue"
import type { IGame } from "@blombo/game-runtime"
import { bindPaid, type PaidProduct, type PaidState } from "./paid"

export const PLACEMENTS = { lucky: "lucky_bait_ad", sale: "sale_boost_ad", rehook: "rehook_ad" } as const
export const SHOP_ORDER = ["sell_x2", "bait_belt", "auto_reel", "vip_boat", "skin_rainbow", "skin_dragon", "skin_candy", "lucky_bait_3", "sale_boost_1", "rehook_1"]

export const paidUi = reactive({
  state: null as PaidState | null,
  /** The latest answer for the player (already in their language). */
  hint: "",
  hintAt: 0,
  products: [] as PaidProduct[],
  /** Rewarded placements Blombo says can play now. */
  ads: {} as Record<string, boolean>,
})

let api: ReturnType<typeof bindPaid> | null = null
let game: IGame | null = null
/** Consumables to spend as soon as a finished video (or purchase) delivers them. */
const spendWhenGranted = new Set<string>()

export function units(productId: string): number {
  return paidUi.state?.items.find((i) => i.id === productId)?.units ?? 0
}
export function owns(productId: string): boolean {
  return units(productId) > 0
}

export function startPaid(g: IGame): () => void {
  game = g
  api = bindPaid(g, {
    changed: (state) => {
      paidUi.state = state
      for (const id of [...spendWhenGranted]) {
        if (units(id) > 0) {
          spendWhenGranted.delete(id)
          api?.use(id)
        }
      }
    },
    message: (text) => {
      paidUi.hint = text
      paidUi.hintAt = Date.now()
    },
  })
  void g.commerce.catalog().then((r) => {
    if (r.ok) paidUi.products = r.value.products
  })
  void refreshAds()
  return () => {
    api?.dispose()
    api = null
    game = null
  }
}

export async function refreshAds(): Promise<void> {
  if (!game) return
  const r = await game.commerce.rewardedAds(Object.values(PLACEMENTS))
  if (!r.ok) return
  for (const p of r.value.placements) paidUi.ads[p.placementId] = p.available
}

export function buy(productId: string): void {
  void api?.buy(productId)
}

/** Spend one unit now (Lucky Bait, Double Sale, Re-hook). */
export function use(productId: string): void {
  api?.use(productId)
}

/** From a player's tap only: the video, then the reward is spent as soon as it arrives. */
export function watchFor(placement: string, productId: string): void {
  spendWhenGranted.add(productId)
  void api?.watchAd(placement).finally(() => {
    void refreshAds()
    // a skipped or failed video must not spend a pack bought later
    window.setTimeout(() => spendWhenGranted.delete(productId), 20_000)
  })
}

export function product(productId: string): PaidProduct | undefined {
  return paidUi.products.find((p) => p.id === productId)
}
