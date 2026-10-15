// Harness stand-in for the blogem-purchase server module: nothing is owned.
export function createPaid(_options: unknown) {
  return { owns: (_u: string, _p: string) => false, units: (_u: string, _p: string) => 0, refresh: async () => {} }
}
