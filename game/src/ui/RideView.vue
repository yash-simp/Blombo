<script setup lang="ts">
// The boat ride between waters. The camera leaves the player and follows your boat out past the
// harbour pier; a sea-spray wash covers the cut; then the boat glides up to the destination's pier
// just as the server moves you there. Everything here is local and cosmetic.
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { CircleGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Vector3 } from "three"
import type { IGame } from "@blombo/game-runtime"
import { t } from "@/text"
import Icon from "./Icon.vue"
import type { World } from "../world/zones"
import { BOATS, ZONES } from "../../server/rules.ts"
import { cloneRoot } from "../assets/packs"
import { zoneName } from "./format"

const props = defineProps<{ game: IGame; world: World; ride: { from: number; to: number; ms: number; boat: number; at: number } }>()

/** Share of the ride spent leaving the origin; the wash hides the cut. */
const LEAVE = 0.52
const WASH = 0.13
/** A harbour pier runs this far out from a zone's `arrive` anchor. */
const PIER = 24
const SIDE = 3.2
const SAIL_OUT = 55
const SAIL_IN = 42
const CAM_BACK = 10.5
const CAM_UP = 4.2
const CAM_SIDE = 3.5
const BLEND_MS = 700
const WAKE_COUNT = 22
const WAKE_EVERY = 0.09

const wash = ref(0)
/** Whether the destination was ready at the cut (decided once). */
let arrivedAtCut: boolean | null = null
const progress = ref(0)
const dest = computed(() => zoneName(props.ride.to))

let release: (() => void) | null = null
let unsubscribe: (() => void) | null = null
let boat: Object3D | null = null
const root = new Group()
const wakeGeometry = new CircleGeometry(0.9, 18)
const wake: { mesh: Mesh; material: MeshBasicMaterial; age: number }[] = []
let wakeNext = 0
let wakeTimer = 0
const fromCam = new Vector3()
const fromLook = new Vector3()
const pos = new Vector3()
const fwd = new Vector3()
const side = new Vector3()
const camPos = new Vector3()
const look = new Vector3()

/** Outward direction (centre → pier) and the water point beside the pier tip of a zone. */
function harbour(zone: number): { tip: Vector3; out: Vector3 } {
  const c = ZONES[zone]!
  const a = props.world.anchor(zone, "arrive") ?? new Vector3(c.x, 0, c.z + 60)
  const out = new Vector3(a.x - c.x, 0, a.z - c.z)
  if (out.lengthSq() < 1) out.set(0, 0, 1)
  out.normalize()
  const right = new Vector3(out.z, 0, -out.x)
  const tip = new Vector3(a.x, 0, a.z).addScaledVector(out, PIER).addScaledVector(right, SIDE)
  return { tip, out }
}

onMounted(() => {
  const g = props.game
  props.world.pinned.add(props.ride.to)
  const id = BOATS[props.ride.boat]?.id ?? "rowboat"
  boat = cloneRoot("boat_" + id) ?? new Group()
  root.add(boat)
  const captain = cloneRoot("captain")
  if (captain) {
    const seat: Record<string, number[]> = { rowboat: [0, 0.25, -0.6], sailboat: [0, 0.5, 1.7], steamer: [0, 0.7, 1.9], yacht: [0, 0.72, -0.5] }
    const s = seat[id] ?? [0, 0.3, 0]
    captain.position.set(s[0]!, s[1]!, s[2]!)
    captain.rotation.y = Math.PI
    captain.scale.setScalar(0.75)
    boat.add(captain)
  }
  for (let i = 0; i < WAKE_COUNT; i++) {
    const material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
    const mesh = new Mesh(wakeGeometry, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.visible = false
    root.add(mesh)
    wake.push({ mesh, material, age: 1 })
  }
  release = g.local.add(root, () => {
    wakeGeometry.dispose()
    for (const w of wake) w.material.dispose()
  })
  fromCam.copy(g.camera.position)
  fromLook.copy(g.camera.position).add(g.camera.getWorldDirection(new Vector3()).multiplyScalar(10))
  g.setCameraMode("manual")
  g.avatars.local?.hide("ride")
  unsubscribe = g.on("frame", ({ dt }) => frame(dt))
  frame(0)
})

onBeforeUnmount(() => {
  unsubscribe?.()
  release?.()
  props.world.pinned.delete(props.ride.to)
  props.world.focus = null
  props.game.setCameraMode("follow")
  props.game.avatars.local?.show("ride")
})

function frame(dt: number): void {
  if (!boat) return
  const g = props.game
  const elapsed = performance.now() - props.ride.at
  const k = Math.min(1, Math.max(0, elapsed / props.ride.ms))
  progress.value = k
  wash.value = Math.max(0, 1 - Math.abs(k - LEAVE) / WASH)
  if (k >= LEAVE && arrivedAtCut === null) arrivedAtCut = props.world.zones.has(props.ride.to)
  const arrived = k < LEAVE ? props.world.zones.has(props.ride.to) || arrivedAtCut === null : arrivedAtCut === true
  if (k < LEAVE || !arrived) {
    // out of the home harbour, speeding up
    const h = harbour(props.ride.from)
    const u = arrived ? k / LEAVE : k
    pos.copy(h.tip).addScaledVector(h.out, SAIL_OUT * Math.pow(u, 1.5) * (arrived ? 1 : 1.6))
    fwd.copy(h.out)
  } else {
    // into the destination harbour, slowing down to the pier
    const h = harbour(props.ride.to)
    const u = (k - LEAVE) / (1 - LEAVE)
    pos.copy(h.tip).addScaledVector(h.out, SAIL_IN * Math.pow(1 - u, 1.6))
    fwd.copy(h.out).negate()
  }
  const time = performance.now() / 1000
  boat.position.set(pos.x, Math.sin(time * 2.1) * 0.07, pos.z)
  props.world.focus = boat.position
  boat.rotation.set(Math.sin(time * 1.7) * 0.03, Math.atan2(-fwd.x, -fwd.z), Math.sin(time * 1.3) * 0.05, "YXZ")
  // the wake: foam rings dropped behind the stern that spread and fade
  wakeTimer -= dt
  if (wakeTimer <= 0 && dt > 0) {
    wakeTimer = WAKE_EVERY
    const w = wake[wakeNext++ % WAKE_COUNT]!
    w.age = 0
    w.mesh.visible = true
    w.mesh.position.set(pos.x - fwd.x * 1.8, 0.04, pos.z - fwd.z * 1.8)
  }
  for (const w of wake) {
    if (!w.mesh.visible) continue
    w.age += dt / 1.6
    if (w.age >= 1) {
      w.mesh.visible = false
      continue
    }
    w.mesh.scale.setScalar(0.6 + w.age * 2.4)
    w.material.opacity = 0.55 * (1 - w.age)
  }
  // the camera trails behind and a little to the side, blending in from where it was
  side.set(fwd.z, 0, -fwd.x)
  camPos.copy(pos).addScaledVector(fwd, -CAM_BACK).addScaledVector(side, CAM_SIDE)
  camPos.y = CAM_UP
  look.copy(pos).addScaledVector(fwd, 6)
  look.y = 0.8
  const b = Math.min(1, elapsed / BLEND_MS)
  const e = b * b * (3 - 2 * b)
  g.camera.position.lerpVectors(fromCam, camPos, e)
  g.camera.lookAt(fromLook.x + (look.x - fromLook.x) * e, fromLook.y + (look.y - fromLook.y) * e, fromLook.z + (look.z - fromLook.z) * e)
}
</script>

<template>
  <div class="wash" :style="{ opacity: wash }" aria-hidden="true"></div>
  <section class="ui-group ui-group--bottom ride" role="status">
    <p class="ride__title"><Icon name="boat" class="ride__icon" />{{ t("travel.sailing", { zone: dest }) }}</p>
    <span class="ride__bar"><span :style="{ width: Math.round(progress * 100) + '%' }"></span></span>
  </section>
</template>

<style scoped>
.wash {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 55%, #ffffff 0%, #d8f4ff 45%, #9fdcf5 100%);
  pointer-events: none;
}
.ride {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 640px;
  padding: 14px 28px 20px;
  border: 5px solid #0b1a2a;
  border-radius: 40px;
  background: rgb(9 27 41 / 88%);
  animation: rideIn 0.4s cubic-bezier(0.2, 1.6, 0.4, 1);
}
.ride__title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  font-size: 52px;
  text-align: center;
}
.ride__icon {
  flex: none;
  width: 80px;
  height: 80px;
}
.ride__bar {
  width: 100%;
  height: 24px;
  border: 4px solid #0b1a2a;
  border-radius: 14px;
  background: #0b1a2a;
  overflow: hidden;
}
.ride__bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #4fb0ff, #9ff0ff);
}
@keyframes rideIn {
  from {
    scale: 0.6;
    opacity: 0;
  }
}
</style>
