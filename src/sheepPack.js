import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SHEEP_KEY } from './sheepKey.js';

// 读取加密打包的小羊模型（assets/sheep.pack，由 tools/pack-sheep.mjs 生成）：
// 用 WebCrypto 解密，拆出里面的 glTF、网格数据和贴图，在内存里交给 GLTFLoader。
// The alpaca package (assets/alpaca.pack, made by tools/prepare-alpaca.mjs) is a whole encrypted GLB instead:
// it's recognised by the 'glTF' magic after decrypting and parsed directly. `keyB64` picks the key for each package.
export async function loadPackedGLTF(url, keyB64 = SHEEP_KEY) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12) }, key, new Uint8Array(buf, 12)));
  const magic = new TextDecoder().decode(plain.subarray(0, 4));
  if (magic === 'glTF') {
    return new Promise((resolve, reject) => new GLTFLoader().parse(plain.buffer, '', resolve, reject));
  }
  if (magic !== 'YLPK') throw new Error(`${url}: bad format`);
  const hlen = new DataView(plain.buffer).getUint32(4, true);
  const { files } = JSON.parse(new TextDecoder().decode(plain.subarray(8, 8 + hlen)));
  const blobs = {};
  let o = 8 + hlen, gltfText = '';
  for (const f of files) {
    const data = plain.subarray(o, o + f.size);
    o += f.size;
    if (f.name.endsWith('.gltf')) gltfText = new TextDecoder().decode(data);
    else blobs[f.name] = URL.createObjectURL(new Blob([data]));
  }
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((u) => blobs[u.split('/').pop()] ?? u);
  try {
    return await new Promise((resolve, reject) => new GLTFLoader(manager).parse(gltfText, '', resolve, reject));
  } finally {
    for (const u of Object.values(blobs)) URL.revokeObjectURL(u);
  }
}
