// GLB packs (Draco-compressed, built by the Blender pipeline in the creator's repository).
// One GLTFLoader + DRACOLoader for the page. The Draco decoder ships inside the bundle: its wrapper as
// text and its .wasm as a bundled asset, so nothing is fetched from outside the game.
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import wrapperSource from "three/examples/jsm/libs/draco/draco_wasm_wrapper.js?raw"
import decoderWasmUrl from "three/examples/jsm/libs/draco/draco_decoder.wasm?url"

class BundledDracoLoader extends DRACOLoader {
  constructor() {
    super()
    this.setWorkerLimit(2)
  }
  // DRACOLoader asks for its two decoder files by name; answer from the bundle instead of a path.
  _loadLibrary(url: string): Promise<string | ArrayBuffer> {
    if (url.endsWith(".wasm")) return fetch(decoderWasmUrl).then((response) => response.arrayBuffer())
    return Promise.resolve(wrapperSource)
  }
}

let loader: GLTFLoader | null = null
function gltfLoader(): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader()
    loader.setDRACOLoader(new BundledDracoLoader())
  }
  return loader
}

/** A file under public/, relative to the page (releases live under a CDN prefix). */
export function assetUrl(path: string): string {
  return import.meta.env.BASE_URL + path
}

const cache = new Map<string, Promise<GLTF>>()
/** Loads a pack once per page; callers clone what they need. */
export function loadPack(path: string): Promise<GLTF> {
  let pending = cache.get(path)
  if (!pending) {
    pending = gltfLoader().loadAsync(assetUrl(path))
    pending.catch(() => cache.delete(path))
    cache.set(path, pending)
  }
  return pending
}
