// Harness stand-in for src/game.ts: a plain three WebGPU renderer (WebGL2 backend), a follow camera,
// a blocky stand-in avatar holding the real rod model, and a fake IGame wired to the api shim, so the
// real HUD, World and fishing controller run unchanged.
import { BoxGeometry, Color, Fog, Frustum, Matrix4, Group, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Scene, SphereGeometry, BackSide, Vector3 } from "three"
import { MeshBasicNodeMaterial, WebGPURenderer } from "three/webgpu"
import { mix, positionLocal, smoothstep, uniform } from "three/tsl"
import { World } from "../../game/src/world/zones"
import { cloneRoot } from "../../game/src/assets/packs"
import { t } from "../platform/text"
import { light, toonMaterial } from "./runtime"
import { client, held, hooks, player } from "./api"
import commerce from "../../game/commerce.json"

export interface Started {
  game: any
  world: World
}

const FORWARD = (yaw: number) => new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))

function skyDome(): Mesh {
  const geometry = new SphereGeometry(1500, 32, 16)
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false })
  const h = smoothstep(-0.05, 0.6, positionLocal.y.div(1500))
  // horizon in the fog colour, the zenith a deeper shade of it (the engine shows a skybox here)
  const horizon = uniform(light.fog.color)
  material.colorNode = mix(horizon, horizon.mul(uniform(new Color(0x5aa8e8)).div(uniform(new Color(0xd8ecfb)))), h)
  return new Mesh(geometry, material)
}

function blockyAvatar(): { root: Group; hand: Group } {
  const root = new Group()
  const part = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), toonMaterial({ color: c }))
    mesh.position.set(x, y, z)
    root.add(mesh)
    return mesh
  }
  part(0.9, 0.95, 0.5, 0x3a8adf, 0, 1.45, 0) // torso
  part(0.62, 0.62, 0.62, 0xf2c89a, 0, 2.25, 0) // head
  part(0.42, 0.9, 0.48, 0x2a3a5a, -0.23, 0.5, 0) // legs
  part(0.42, 0.9, 0.48, 0x2a3a5a, 0.23, 0.5, 0)
  part(0.3, 0.9, 0.36, 0xf2c89a, -0.62, 1.45, 0) // left arm
  const hand = new Group()
  hand.position.set(0.62, 1.85, 0)
  const arm = new Mesh(new BoxGeometry(0.3, 0.9, 0.36), toonMaterial({ color: 0xf2c89a }))
  arm.position.set(0, -0.4, 0)
  hand.add(arm)
  hand.rotation.x = 0.9
  root.add(hand)
  return { root, hand }
}

export async function startGame(canvas: HTMLCanvasElement, _touchLayer: HTMLElement): Promise<Started> {
  const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  await renderer.init()
  const scene = new Scene()
  scene.background = new Color(0xbfe0f8)
  scene.add(skyDome())
  const fog = new Fog(light.fog.color, light.fog.near, light.fog.far)
  scene.fog = fog
  const camera = new PerspectiveCamera(60, 1, 0.1, 2000)
  let cameraMode: "follow" | "manual" = "follow"
  const frameHandlers = new Set<(e: { dt: number }) => void>()
  const connectionHandlers = new Set<() => void>()
  const position = new Vector3(player.x, player.y, player.z)
  const avatar = blockyAvatar()
  scene.add(avatar.root)
  let rodKey = ""
  let rod: Object3D | null = null
  const hidden = new Set<string>()

  hooks.teleport = (x, y, z, yaw) => {
    position.set(x, y, z)
    player.x = x
    player.y = y
    player.z = z
    player.yaw = yaw
  }

  const game: any = {
    canvas,
    session: "online",
    online: true,
    paused: false,
    localPlayer: { userId: player.userId },
    players: [{ userId: player.userId, name: player.name, sessionId: player.sessionId }],
    camera,
    player: {
      position,
      get yaw() {
        return player.yaw
      },
    },
    t: (key: string, params?: Record<string, string | number>) => t(key, params),
    on(name: string, cb: (...a: any[]) => void) {
      if (name === "frame") {
        frameHandlers.add(cb)
        return () => frameHandlers.delete(cb)
      }
      if (name === "connection") {
        connectionHandlers.add(cb)
        return () => connectionHandlers.delete(cb)
      }
      if (name === "remote") return client.onEvent(cb)
      return () => {}
    },
    remotes: { send: (name: string, payload: unknown) => client.send(name, payload), watch: client.watch },
    local: {
      add(object: Object3D, cleanup: () => void) {
        scene.add(object)
        return () => {
          scene.remove(object)
          cleanup()
        }
      },
    },
    avatars: {
      local: {
        hide: (reason: string) => hidden.add(reason),
        show: (reason: string) => hidden.delete(reason),
        itemSocketWorld(_hand: string, _socket: string, out: Vector3) {
          if (!rod) return false
          rod.updateWorldMatrix(true, false)
          out.set(0, 0, -1.9).applyMatrix4(rod.matrixWorld)
          return true
        },
        socketWorld: () => false,
        attach: (_socket: string, object: Object3D) => {
          object.position.y += 2.25
          avatar.root.add(object)
          return () => avatar.root.remove(object)
        },
      },
      get: () => null,
      defineItem: () => {},
      defineClip: () => {},
    },
    hands: { play: () => {}, stop: () => {}, mode: "auto" },
    setCameraMode: (mode: "follow" | "manual") => void (cameraMode = mode),
    setAimPitch: () => {},
    setRenderScale: (k: number) => renderer.setPixelRatio(Math.min(2, window.devicePixelRatio) * k),
    configureTouchControls: () => {},
    bindAction(o: { code: string; button?: HTMLButtonElement; onActivate?: () => void; onRelease?: () => void; onCancel?: () => void }) {
      const down = (e: KeyboardEvent) => {
        if (e.code === o.code && !e.repeat) o.onActivate?.()
      }
      const up = (e: KeyboardEvent) => {
        if (e.code === o.code) o.onRelease?.()
      }
      const pdown = (e: PointerEvent) => {
        e.preventDefault()
        o.onActivate?.()
      }
      const pup = () => o.onRelease?.()
      window.addEventListener("keydown", down)
      window.addEventListener("keyup", up)
      o.button?.addEventListener("pointerdown", pdown)
      o.button?.addEventListener("pointerup", pup)
      return () => {
        window.removeEventListener("keydown", down)
        window.removeEventListener("keyup", up)
        o.button?.removeEventListener("pointerdown", pdown)
        o.button?.removeEventListener("pointerup", pup)
      }
    },
    commerce: {
      catalog: async () => ({ ok: true, value: { mode: "test", holdDays: 7, products: (commerce as any).products } }),
      state: async () => ({ ok: true, value: { mode: "test", items: [] } }),
      rewardedAds: async (ids: string[]) => ({ ok: true, value: { mode: "test", delivery: "simulated", placements: ids.map((placementId) => ({ placementId, available: true })) } }),
      promptPurchase: async () => ({ ok: false, reason: "cancelled" }),
      showRewardedAd: async () => ({ ok: false, reason: "declined" }),
    },
    dispose: () => renderer.dispose(),
  }

  const world = new World(game)
  let last = performance.now()
  // Software rendering in a headless browser draws about one frame a second, so the game ticks on a
  // 60 Hz timer and the scene is drawn only when a screenshot asks for it (window.__harness.render).
  const tick = () => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    // the stand-in avatar and its rod
    avatar.root.visible = hidden.size === 0
    avatar.root.position.copy(position)
    avatar.root.rotation.y = player.yaw
    const want = held.right ?? ""
    if (want !== rodKey) {
      rodKey = want
      if (rod) avatar.root.remove(rod)
      rod = want ? cloneRoot(want.startsWith("rod_skin_") ? want.slice(4) : want) : null
      if (rod) {
        rod.rotation.set(0.6, 0, 0)
        rod.position.set(0.62, 1.35, -0.63)
        avatar.root.add(rod)
      }
    }
    for (const cb of [...frameHandlers]) cb({ dt })
    fog.color.copy(light.fog.color)
    fog.near = light.fog.near
    fog.far = light.fog.far
    if (cameraMode === "follow") {
      const back = FORWARD(player.yaw).multiplyScalar(-7)
      camera.position.set(position.x + back.x, position.y + 3.4, position.z + back.z)
      camera.lookAt(position.x, position.y + 1.7, position.z)
    }
    const hs = (window as any).__harness
    hs.frames = (hs.frames ?? 0) + 1
  }
  const render = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w && h) {
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    renderer.render(scene, camera)
  }
  window.setInterval(tick, 16)
  ;(window as any).__harness.render = render
  /** Renders `n` frames back to back (each forced to finish) and reports time, draw calls and triangles. */
  ;(window as any).__harness.bench = (n = 10) => {
    const gl = (renderer as any).backend?.gl as WebGL2RenderingContext | undefined
    const px = new Uint8Array(4)
    render()
    gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    const t0 = performance.now()
    for (let i = 0; i < n; i++) {
      tick()
      render()
      gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    }
    const ms = (performance.now() - t0) / n
    ;(renderer as any).info.reset()
    render()
    const info = (renderer as any).info.render
    let shadowTris = 0
    let meshes = 0
    scene.traverse((o: any) => {
      if (!o.isMesh || !o.visible) return
      meshes++
      if (o.castShadow) {
        const g = o.geometry
        const tris = (g.index ? g.index.count : g.attributes.position.count) / 3
        shadowTris += tris * (o.isInstancedMesh ? o.count : 1)
      }
    })
    // what the draws are: frustum-visible meshes by kind
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    const kinds: Record<string, number> = {}
    scene.updateMatrixWorld()
    scene.traverseVisible((o: any) => {
      if (!(o.isMesh || o.isSprite)) return
      if (o.isMesh && o.geometry && o.frustumCulled !== false) {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere()
        const sphere = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld)
        if (!frustum.intersectsSphere(sphere)) return
      }
      let k = o.isSprite ? "sprite" : o.isInstancedMesh ? "instanced" : "mesh"
      let p = o
      while (p && !p.name) p = p.parent
      const nm = (p?.name ?? "").startsWith("chunk:") ? p.name : (p?.name ?? "").replace(/_\d+.*$/, "")
      k += ":" + (nm || o.material?.name || "?")
      kinds[k] = (kinds[k] ?? 0) + 1
      if (o.isMesh) {
        const g = o.geometry
        const tris = ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1)
        kinds["tris " + k] = (kinds["tris " + k] ?? 0) + Math.round(tris)
      }
    })
    return { kinds, msPerFrame: Math.round(ms), fps: +(1000 / ms).toFixed(2), drawCalls: info.drawCalls, triangles: info.triangles, shadowCasterTris: Math.round(shadowTris), visibleMeshes: meshes, pixels: [canvas.width, canvas.height] }
  }
  await world.init()
  await client.join()
  render()
  for (const cb of connectionHandlers) cb()
  ;(window as any).__harness.game = game
  ;(window as any).__harness.world = world
  return { game, world }
}
