// Turns the CGTrader "Alpaca Animal" model (by Nyilonelycompany, Royalty Free License) into the encrypted web package
// assets/alpaca.pack that the page loads (see src/sheepPack.js and the 'alpaca' look in src/sheepModels.js).
//
// What it does:
//   - bakes three static poses from the model's skeleton: standing (the bind pose), a mid pose (Idle_Headlow) and a
//     grazing pose (Eating). The game has no skeletal animation (every animal is one instanced, static mesh), so the
//     shader blends stand → mid → graze per animal to lower the neck, and swings the legs itself;
//   - recolours the golden-brown fur to white (the eyes, hooves, teeth and tongue keep their colours, the darkest
//     creases stay dark); each animal's coat colour is then applied per instance at runtime;
//   - drops the skin and the animations; keeps the fur's normal map (the strands' relief) and its roughness;
//   - shrinks the textures from 4K to 2K (at the size an alpaca takes on screen the two look the same, and 4K costs
//     four times the graphics memory and a stutter while it uploads);
//   - encrypts the result (AES-256-GCM) so the model files can't be downloaded straight from the site, as the CGTrader
//     licence requires, and writes a fresh key to src/alpacaKey.js.
//
// Usage: put the purchased Alpaca_2.glb in models/alpaca/ (git-ignored), then
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp three
//   node tools/prepare-alpaca.mjs [path/to/Alpaca_2.glb]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';
import * as THREE from 'three';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { webcrypto as crypto } from 'crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || join(ROOT, 'models/alpaca/Alpaca_2.glb');
const MID = ['Idle_Headlow', 2.0];   // [animation, seconds into it]
const EAT = ['Eating', 3.0];
const TEX_SIZE = 2048;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SRC);
const root = doc.getRoot();
const meshNode = root.listNodes().find((n) => n.getMesh() && n.getSkin());
const skin = meshNode.getSkin();
const joints = skin.listJoints();
const ibm = skin.getInverseBindMatrices();
const prim = meshNode.getMesh().listPrimitives()[0];
const POS = prim.getAttribute('POSITION'), NRM = prim.getAttribute('NORMAL');
const JNT = prim.getAttribute('JOINTS_0'), WGT = prim.getAttribute('WEIGHTS_0');
const anim = (name) => root.listAnimations().find((a) => a.getName() === name);

// —— poses: sample the animation at a time, walk the node tree, skin every vertex ——
function localMatrix(node, clip, t) {
  const trs = { translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale() };
  if (clip) for (const ch of clip.listChannels()) {
    if (ch.getTargetNode() !== node) continue;
    const smp = ch.getSampler(), times = smp.getInput().getArray(), out = smp.getOutput();
    const tt = times[0] + t;
    let k = 0;
    while (k < times.length - 1 && times[k + 1] <= tt) k++;
    const k2 = Math.min(k + 1, times.length - 1);
    const f = smp.getInterpolation() === 'STEP' || k2 === k ? 0 : THREE.MathUtils.clamp((tt - times[k]) / (times[k2] - times[k]), 0, 1);
    const stride = smp.getInterpolation() === 'CUBICSPLINE' ? 3 : 1, off = stride === 3 ? 1 : 0;
    const a = out.getElement(k * stride + off, []), b = out.getElement(k2 * stride + off, []);
    trs[ch.getTargetPath()] = ch.getTargetPath() === 'rotation'
      ? new THREE.Quaternion(...a).slerp(new THREE.Quaternion(...b), f).toArray()
      : a.map((v, i) => v + (b[i] - v) * f);
  }
  return new THREE.Matrix4().compose(new THREE.Vector3(...trs.translation), new THREE.Quaternion(...trs.rotation), new THREE.Vector3(...trs.scale));
}

function bake([clipName, t]) {
  const clip = anim(clipName);
  if (!clip) throw new Error(`animation ${clipName} not found`);
  const world = new Map();
  const visit = (node, parent) => {
    const m = parent.clone().multiply(localMatrix(node, clip, t));
    world.set(node, m);
    for (const c of node.listChildren()) visit(c, m);
  };
  for (const n of root.listScenes()[0].listChildren()) visit(n, new THREE.Matrix4());
  const mats = joints.map((j, i) => world.get(j).clone().multiply(new THREE.Matrix4().fromArray(ibm.getElement(i, []))));
  const nmats = mats.map((m) => new THREE.Matrix3().getNormalMatrix(m));
  const n = POS.getCount(), P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  const q = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let v = 0; v < n; v++) {
    const p = POS.getElement(v, []), no = NRM.getElement(v, []), j = JNT.getElement(v, []), w = WGT.getElement(v, []);
    const ws = w[0] + w[1] + w[2] + w[3] || 1;
    a.set(0, 0, 0); b.set(0, 0, 0);
    for (let k = 0; k < 4; k++) if (w[k] > 0) {
      a.addScaledVector(q.fromArray(p).applyMatrix4(mats[j[k]]), w[k] / ws);
      b.addScaledVector(q.fromArray(no).applyMatrix3(nmats[j[k]]), w[k] / ws);
    }
    a.toArray(P, v * 3);
    b.normalize().toArray(N, v * 3);
  }
  return { P, N };
}
const mid = bake(MID), eat = bake(EAT);
const addAttr = (name, array) => prim.setAttribute(name, doc.createAccessor(name).setType('VEC3').setArray(array).setBuffer(POS.getBuffer()));
addAttr('_MID_POSITION', mid.P); addAttr('_MID_NORMAL', mid.N);
addAttr('_EAT_POSITION', eat.P); addAttr('_EAT_NORMAL', eat.N);

// —— static mesh: no skin, no animations, mesh node directly under the scene ——
for (const a of root.listAnimations()) {
  // dispose channels and samplers too, or their keyframe data stays referenced and survives prune()
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}
meshNode.setSkin(null);
for (const s of root.listSkins()) s.dispose();
prim.setAttribute('JOINTS_0', null).setAttribute('WEIGHTS_0', null);
const scene = root.listScenes()[0];
meshNode.getParentNode()?.removeChild(meshNode);
for (const n of scene.listChildren()) scene.removeChild(n);
scene.addChild(meshNode);
meshNode.setName('alpaca').setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
for (const n of root.listNodes()) if (n !== meshNode) n.dispose();

// —— material + white fur texture ——
const mat = prim.getMaterial();
const baseTex = mat.getBaseColorTexture(), normalTex = mat.getNormalTexture(), mrTex = mat.getMetallicRoughnessTexture();
const SRC_BASE = baseTex.getImage(), SRC_NORMAL = normalTex.getImage(), SRC_MR = mrTex.getImage();
const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// 4:4:4 (no chroma subsampling) keeps the fine strands, and keeps the normal map's x / y channels sharp
const jpeg = (img, quality) => img.jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();

async function whiteFur(size) {
  const { data, info } = await sharp(SRC_BASE).resize(size, size, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0, o = 0; i < data.length; i += 4, o += 3) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255, alpha = data[i + 3] / 255;
    let R = r, G = g, B = b;
    if (alpha < 0.5) {
      R = G = B = 0.86;   // empty texture space: light, so blurred mip levels don't darken the fur along seams
    } else {
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // fur = warm brown, judged relative to brightness so the darkest browns count too (red clearly above blue, not pink);
      // eyes, hooves, teeth and tongue stay as they are
      const k = Math.max(r, 0.03);
      const fur = ss(0.12, 0.3, (r - b) / k) * (1 - ss(0, 0.1, (b - g) / k));
      const light = Math.min(1, Math.max(0.6, 0.88 + (L - 0.31) * 0.6));   // golden fur → white wool, keeps the strand detail
      const t = ss(0.03, 0.12, L);                                         // the darkest creases (nostrils, mouth, eye rims) go soft grey
      const w = (0.42 + L * 2) * (1 - t) + light * t;
      R = r + (w - r) * fur; G = g + (w * 0.995 - g) * fur; B = b + (w * 0.985 - b) * fur;
    }
    out[o] = Math.round(R * 255); out[o + 1] = Math.round(G * 255); out[o + 2] = Math.round(B * 255);
  }
  return jpeg(sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }), 92);
}
// (quality 88 at 4:4:4: the normals come back within about two degrees of the original on average)
const normalMap = (size) => jpeg(sharp(SRC_NORMAL).removeAlpha().resize(size, size, { kernel: 'lanczos3' }), 88);

// alpaca.pack: 2K colour and normal map, 1K roughness (the green channel; a grey JPEG has it in every channel, and
// the metalness it also carries in blue is multiplied by a metallic factor of 0)
const fur2k = await whiteFur(TEX_SIZE), normal2k = await normalMap(TEX_SIZE);
const rough2k = await jpeg(sharp(SRC_MR).extractChannel(1).resize(TEX_SIZE / 2, TEX_SIZE / 2, { kernel: 'lanczos3' }), 90);
mat.setName('fur').setMetallicFactor(0).setRoughnessFactor(1).setBaseColorFactor([1, 1, 1, 1]);
baseTex.setImage(fur2k).setMimeType('image/jpeg').setURI('fur.jpg').setName('fur');
normalTex.setImage(normal2k).setMimeType('image/jpeg').setURI('fur-normal.jpg').setName('fur-normal');
mrTex.setImage(rough2k).setMimeType('image/jpeg').setURI('fur-roughness.jpg').setName('fur-roughness');
for (const ext of root.listExtensionsUsed()) ext.dispose();
await doc.transform(prune());
const glb = Buffer.from(await io.writeBinary(doc));

// —— encrypt: 12-byte IV + AES-256-GCM(GLB) ——
const keyBytes = crypto.getRandomValues(new Uint8Array(32));
const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
async function encrypt(data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return Buffer.concat([Buffer.from(iv), Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data))]);
}
writeFileSync(join(ROOT, 'assets/alpaca.pack'), await encrypt(glb));
writeFileSync(join(ROOT, 'src/alpacaKey.js'),
  `// Generated by tools/prepare-alpaca.mjs: key for decrypting assets/alpaca.pack\nexport const ALPACA_KEY = '${Buffer.from(keyBytes).toString('base64')}';\n`);
const MB = (n) => (n / 1048576).toFixed(2);
console.log(`alpaca.pack: ${MB(glb.length)} MB (colour ${MB(fur2k.length)}, normal ${MB(normal2k.length)}, roughness ${MB(rough2k.length)} MB; ${POS.getCount()} vertices)`);
