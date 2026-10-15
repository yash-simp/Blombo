// Harness stand-in for the example's src/paid.ts (the real file lives in the workspace, copied unchanged).
export type PaidProduct = { id: string; name: string; description: string; kind: "permanent" | "consumable"; priceBlogems: number; quantity: number }
export type PaidState = { items: { id: string; units: number }[]; mode: "live" | "test" | "offline"; ask: number }
export function bindPaid(game: any, feedback: { changed(state: PaidState): void; message(text: string): void }) {
  const off = game.remotes.watch("Paid", (s: PaidState | undefined) => s && feedback.changed(s))
  return {
    async buy(_id: string) {},
    async watchAd(_placement: string) {},
    use(id: string) {
      game.remotes.send("PaidUse", id)
    },
    refresh() {},
    dispose() {
      off()
    },
  }
}
