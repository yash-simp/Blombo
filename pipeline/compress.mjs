// Draco-compress GLBs exported by Blender: node compress.mjs in.glb out.glb [--no-draco]
import { NodeIO } from "@gltf-transform/core"
import { KHRDracoMeshCompression, ALL_EXTENSIONS } from "@gltf-transform/extensions"
import { dedup, prune, weld, quantize } from "@gltf-transform/functions"
import draco3d from "draco3dgltf"

const [, , input, output, flag] = process.argv
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.encoder": await draco3d.createEncoderModule(),
  "draco3d.decoder": await draco3d.createDecoderModule(),
})
const doc = await io.read(input)
await doc.transform(dedup(), prune(), weld())
if (flag !== "--no-draco") {
  doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({
    method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
    encodeSpeed: 3,
    decodeSpeed: 5,
    quantizationBits: { POSITION: 14, NORMAL: 10, COLOR: 8, TEX_COORD: 12, GENERIC: 12 },
  })
}
await io.write(output, doc)
const fs = await import("node:fs")
console.log(output, fs.statSync(input).size, "->", fs.statSync(output).size)
