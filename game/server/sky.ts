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

// Warm light (sun, tint) over a cool shade must not lift red and blue above green, or light ground and
// white snow turn pink/purple: dawn and dusk are golden over blue-grey, night a soft grey moonlight.
const LOOK: Record<string, Look> = {
  dawn: { brightness: 94, tint: 0xfff0e0, sunColor: 0xffd4a0, shadeColor: 0xbccce8, fog: 2, fogColor: 0xf2d8c4 },
  day: { brightness: 108, tint: 0xffffff, sunColor: 0xfff1dc, shadeColor: 0xd6e6ff, fog: 1, fogColor: 0xd8ecfb },
  dusk: { brightness: 86, tint: 0xffecd4, sunColor: 0xffc47c, shadeColor: 0xa4b8d4, fog: 2, fogColor: 0xe6c4a6 },
  night: { brightness: 66, tint: 0xccd4ea, sunColor: 0xccdaff, shadeColor: 0x8c96b4, fog: 3, fogColor: 0x283244 },
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

/** A weather haze colour dimmed with the light, so rain or fog at night stays a dark haze. */
function haze(color: number, brightness: number): number {
  return lerpColor(0x000000, color, Math.min(1, brightness / LOOK.day!.brightness))
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
  const lit = look.brightness
  if (sky.weather === "rain") {
    look.brightness *= 0.85
    look.fog = Math.max(look.fog, 4)
    look.fogColor = lerpColor(look.fogColor, haze(0x8a98a8, lit), 0.6)
  } else if (sky.weather === "fog") {
    look.fog = 8
    look.fogColor = lerpColor(look.fogColor, haze(0xc8d0d8, lit), 0.7)
  } else if (sky.weather === "storm") {
    look.brightness *= 0.7
    look.fog = Math.max(look.fog, 5)
    look.fogColor = lerpColor(look.fogColor, haze(0x4a5868, lit), 0.7)
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
