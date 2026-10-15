// Day, night and weather for the room's light, fog and sky (the same clock in every room).
import { type Sky, skyAt } from "./rules.ts"
import { MUSIC } from "./sounds.ts"

interface Look {
  brightness: number
  tint: number
  sunColor: number
  shadeColor: number
  fog: number
  fogColor: number
}

const LOOK: Record<string, Look> = {
  dawn: { brightness: 92, tint: 0xffe2c8, sunColor: 0xffc89a, shadeColor: 0xc8c8ff, fog: 2, fogColor: 0xf6d6c0 },
  day: { brightness: 108, tint: 0xffffff, sunColor: 0xfff1dc, shadeColor: 0xd6e6ff, fog: 1, fogColor: 0xd8ecfb },
  dusk: { brightness: 82, tint: 0xffd0b0, sunColor: 0xff9a6a, shadeColor: 0xb8a8e8, fog: 2, fogColor: 0xe8b8a8 },
  night: { brightness: 52, tint: 0x9fb2ff, sunColor: 0xb8c8ff, shadeColor: 0x6070b8, fog: 3, fogColor: 0x1c2848 },
}
const SKIES: Record<string, string> = {
  "dawn:clear": "optimistic-sunrise",
  "day:clear": "cartoon-airbrush-fluffybluesky",
  "dusk:clear": "epic-sunsetgoldenlayers",
  "night:clear": "night-moon-high-clear",
  "night:aurora": "space-nebula-green",
  "day:rain": "overcast-low",
  "dawn:rain": "overcast-low",
  "dusk:rain": "day-sun-low-overcast-2",
  "night:rain": "night-moon-low-overcast2",
  "day:fog": "day-sun-mid-foghigh",
  "dawn:fog": "day-sun-low-foghigh",
  "dusk:fog": "day-sun-low-foghigh",
  "night:fog": "night-moon-low-foghigh",
  "day:storm": "epic-brightincomingstorm",
  "dawn:storm": "epic-brightincomingstorm",
  "dusk:storm": "epic-twilightstormglow",
  "night:storm": "epic-nightstormmoonglow",
}

let lastSky = ""
let lastNight: boolean | null = null

function lerpColor(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 255
  const mix = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t)
  return (mix(16) << 16) | (mix(8) << 8) | mix(0)
}

/** The environment for a sky state; transitions blend toward the next phase near its end. */
export function lookFor(sky: Sky): Look & { sunAzimuth: number; sunElevation: number } {
  const base = LOOK[sky.phase]!
  const next = LOOK[sky.phase === "dawn" ? "day" : sky.phase === "day" ? "dusk" : sky.phase === "dusk" ? "night" : "dawn"]!
  const blend = Math.max(0, 1 - sky.phaseLeftMs / 45_000)
  const look: Look = {
    brightness: base.brightness + (next.brightness - base.brightness) * blend,
    tint: lerpColor(base.tint, next.tint, blend),
    sunColor: lerpColor(base.sunColor, next.sunColor, blend),
    shadeColor: lerpColor(base.shadeColor, next.shadeColor, blend),
    fog: base.fog,
    fogColor: lerpColor(base.fogColor, next.fogColor, blend),
  }
  if (sky.weather === "rain") {
    look.brightness *= 0.85
    look.fog = Math.max(look.fog, 4)
    look.fogColor = lerpColor(look.fogColor, 0x8a98a8, 0.6)
  } else if (sky.weather === "fog") {
    look.fog = 8
    look.fogColor = lerpColor(look.fogColor, 0xc8d0d8, 0.7)
  } else if (sky.weather === "storm") {
    look.brightness *= 0.7
    look.fog = Math.max(look.fog, 5)
    look.fogColor = lerpColor(look.fogColor, 0x4a5868, 0.7)
    look.tint = lerpColor(look.tint, 0xa8b8d0, 0.5)
  } else if (sky.weather === "aurora") {
    look.tint = lerpColor(look.tint, 0x9fffd8, 0.35)
    look.brightness *= 1.1
  }
  // The sun travels across the sky through the day; at night the "sun" is a soft moon light.
  const dayT = sky.t / 0.6667
  const elevation = sky.night ? 50 : Math.max(8, Math.sin(Math.min(1, dayT) * Math.PI) * 62)
  const azimuth = sky.night ? 200 : 90 + dayT * 180
  return { ...look, sunAzimuth: azimuth, sunElevation: elevation }
}

export function tickSky(): void {
  const sky = skyAt(Date.now())
  const look = lookFor(sky)
  try {
    api.world.setEnvironment({
      fog: Math.round(look.fog),
      fogColor: look.fogColor,
      brightness: look.brightness,
      tint: look.tint,
      sunAzimuth: look.sunAzimuth,
      sunElevation: look.sunElevation,
      sunColor: look.sunColor,
      shadeColor: look.shadeColor,
      shading: 55,
    })
    const id = SKIES[sky.phase + ":" + sky.weather] ?? SKIES[sky.phase + ":clear"] ?? "cartoon-base-bluesky"
    if (id !== lastSky) {
      api.world.setSkybox(id)
      lastSky = id
    }
    if (lastNight !== sky.night) {
      lastNight = sky.night
      api.sound.setSoundtrack(sky.night ? MUSIC.night : MUSIC.day, 40)
    }
  } catch (error) {
    api.warn("sky", String(error))
  }
}
