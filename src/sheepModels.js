import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SHEEP_CAPACITY } from './sheep.js';
import { withClouds } from './materials.js';
import { makeSheepMaterial, sheepToonEnabled, NECK_GLSL, GRAZE_GLSL } from './sheepShader.js';
import { loadPackedGLTF } from './sheepPack.js';
import { buildProceduralSheep } from './sheepProcedural.js';
import { ALPACA_KEY } from './alpacaKey.js';

// The herd's possible looks (the release version uses only the first; licences in CREDITS.md).
// 1 is the alpaca (CGTrader "Alpaca Animal", packed and encrypted by tools/prepare-alpaca.mjs); 2 is this clone's
// procedural sheep; 3 is the original's CGTrader sheep (not included: assets/sheep.pack); 4 and 5 need models in models/.
// All are static meshes: legs swing in the vertex shader in step with the gait, and the head turns around the neck.
//   build     code-generated model (instead of url / pack)
//   key       decryption key for `pack` (default: the sheep key)
//   graze     the model carries baked mid / grazing poses (aMidPos, aEatPos …): grazing blends to them instead of nodding
//   neck      explicit neck (model's own units, before normalising): pivot [y, z], z / y ramps where the neck starts to turn
//   spacing   how much room each animal takes in the herd (multiplier, default 1)
//   coats     per-animal coat colours: a function returning a THREE.Color (default: plain brightness variation)
//   nod       低头吃草时头低下去的幅度（倍数，默认 1）
//   height    归一化后的总高度（米，乘上每只羊的体型系数）
//   headNode  用来判断头朝哪边的部件
//   headParts 能单独点头 / 转头的部件（名字前缀，含子孙）
//   hip       腿的上端（占总高度的比例），以下的部分会随步伐前后摆
//   wool      用羊毛材质的部件（按材质名）：绒面光泽 + 用颜色贴图本身做凹凸，一卷卷的毛有起伏
//   hd        a second encrypted package with the fur's colour and normal map at full resolution: loaded after the
//             game has started (desktop browsers only) and swapped in
//   style     'real' or 'toon': this look's shading, whatever the tuning says (the dev panel can still switch it)
// Alpaca coats: about 80% white variants and 20% macaron pastels (the clearly coloured swatches of a 72-colour palette).
const WHITE_COATS = [['#ffffff', 3], ['#fff8ee', 2], ['#fbf0df', 2], ['#f3f5fa', 1], ['#f1e6d6', 1], ['#e9e7e4', 1]];
const MACARON_COATS = [
  '#bdc4e2', '#efcdd5', '#ecc8d8', '#f8cac3', '#f7c3bd', '#f8d8c4', '#f8ddb6', '#fcd8b2', '#fee3db', '#fce9c0', '#f0dece',
  '#f3d3c9', '#f0cdc3', '#f0d5c5', '#e8d9ba', '#f5fea4', '#fffed0', '#f4da98', '#f4c8a0', '#f5b89e', '#f4a5cf', '#f8c1d5',
  '#f2a6c2', '#f7cfea', '#f5c3b4', '#f2c7c3', '#9ed8dc', '#9dcee9', '#81d7ee', '#f6b5e0', '#dea8d5', '#6be5d8', '#b0d5c9',
  '#a2dfd6', '#a1dbbc', '#b7c581', '#e4be67', '#cebe6f', '#dbd7b4', '#d8f9bf', '#fdf7c3', '#efbae7', '#b9e3d3', '#e5eacc',
  '#d1fae8', '#d4f7fd', '#f1dfc7', '#e9cac1', '#cfe2f9', '#bdd7f3', '#a6cad1', '#9cc5e1', '#aed3f3', '#bee8f4',
];
export const MACARON_SHARE = 0.2;
const WHITE = new THREE.Color(1, 1, 1);
// Coats are drawn from a shuffled bag of five (one macaron, four white), so any stretch of the herd keeps the 1-in-5 mix.
let coatBag = [];
function alpacaCoat() {
  if (!coatBag.length) {
    const n = Math.round(1 / MACARON_SHARE);
    coatBag = Array.from({ length: n }, (_, i) => i === 0);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [coatBag[i], coatBag[j]] = [coatBag[j], coatBag[i]]; }
  }
  // the shading brightens and saturates fur, so the swatches go 30% of the way to white to stay macaron-pale on screen
  if (coatBag.pop()) return new THREE.Color(MACARON_COATS[Math.floor(Math.random() * MACARON_COATS.length)]).lerp(WHITE, 0.3);
  let r = Math.random() * WHITE_COATS.reduce((s, [, w]) => s + w, 0);
  for (const [hex, w] of WHITE_COATS) if ((r -= w) <= 0) return new THREE.Color(hex);
  return new THREE.Color('#ffffff');
}

export const SHEEP_LOOKS = [
  {
    id: 'alpaca', label: 'Alpaca · Nyilonelycompany (CGTrader)',
    pack: 'assets/alpaca.pack', hd: 'assets/alpaca-4k.pack', key: ALPACA_KEY, height: 1.75, hip: 0.29, wool: ['fur'],
    graze: true, spacing: 1.35, coats: alpacaCoat, style: 'real',
    neck: { pivot: [2.62, 1.3], z: [0.95, 1.3], y: [2.3, 2.85] },
  },
  {
    id: 'woolly', label: 'Woolly sheep (procedural)',
    build: buildProceduralSheep, height: 1.0, headNode: 'head',
    headParts: ['head'], hip: 0.28, wool: ['wool'], nod: 1.15,
  },
  {
    id: 'cgtrader', label: 'Realistic Sheep · WildMesh3D (CGTrader)',
    pack: 'assets/sheep.pack', height: 1.0, headNode: 'sm_1_0_0',
    headParts: ['sm_1_0_0', 'sm_2_0_0'], hip: 0.36, wool: ['Material.001', 'Material'],
  },
  {
    id: 'dibarts', label: 'Sheep · DibArts',
    url: 'models/sheep/scene.gltf', height: 1.05, headNode: 'Object_5', hip: 0.3,
  },
  {
    id: 'cartoon', label: 'Cartoon sheep · _Yen_',
    url: 'models/cartoon_sheep/scene.gltf', height: 1.05, headNode: 'face',
    headParts: ['face', 'ears', 'eyes', 'nose', 'mouth'], hip: 0.26,
    colors: { wool: '#e8e0cf' },
  },
];

export function lookDef(id) {
  return SHEEP_LOOKS.find((d) => d.id === id) || SHEEP_LOOKS[0];
}

const loader = new GLTFLoader();
const templates = new Map();

// 把模型转到“脚底在 y=0、头朝 +Z、高度为 height”的统一坐标里
function normalize(obj, headObj, height) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true);
  const center = box.getCenter(new THREE.Vector3());
  const wrap = new THREE.Group();
  wrap.add(obj);
  if (headObj) {
    // 取头部件包围盒的中心（有些模型的部件原点并不在部件上）
    const hp = new THREE.Box3().setFromObject(headObj, true).getCenter(new THREE.Vector3());
    wrap.rotation.y = -Math.atan2(hp.x - center.x, hp.z - center.z);
  }
  wrap.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(wrap, true);
  const s = height / (b2.max.y - b2.min.y);
  const c2 = b2.getCenter(new THREE.Vector3());
  const outer = new THREE.Group();
  outer.add(wrap);
  outer.scale.setScalar(s);
  outer.position.set(-c2.x * s, -b2.min.y * s, -c2.z * s);
  outer.updateMatrixWorld(true);
  return outer;
}

// DibArts 的模型用的是 KHR_materials_pbrSpecularGlossiness，新版 three 已不再解析，手动取出漫反射颜色
function applySpecGlossColors(gltf) {
  if (!gltf.parser) return;
  const json = gltf.parser.json;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const idx = gltf.parser.associations.get(o.material)?.materials;
    const sg = json.materials?.[idx]?.extensions?.KHR_materials_pbrSpecularGlossiness;
    if (sg?.diffuseFactor) {
      o.material.color.setRGB(sg.diffuseFactor[0], sg.diffuseFactor[1], sg.diffuseFactor[2]);
      o.material.roughness = 1 - (sg.glossinessFactor ?? 0.3) * 0.6;
      o.material.metalness = 0;
    }
  });
}

// 羊毛：几乎没有镜面反射，边缘有绒毛透出的柔光（sheen），颜色贴图里的毛卷同时当作凹凸
// Fur that comes with its own normal map (the alpaca) uses it instead, with its roughness map: matte fur, glossy eyes
function woolMaterial(src) {
  const m = new THREE.MeshPhysicalMaterial({
    name: src.name,
    map: src.map,
    color: src.color,
    roughness: 1,
    metalness: 0,
    specularIntensity: 0.15,
    sheen: 1,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color('#fff4e4'),
    side: src.side,
  });
  if (src.normalMap) {
    m.normalMap = src.normalMap;
    m.normalScale.copy(src.normalScale);
    m.roughnessMap = src.roughnessMap;
    m.specularIntensity = 0.5;
  } else {
    m.bumpMap = src.map;
    m.bumpScale = 2.6;
  }
  return m;
}

const inGroup = (o, names) => {
  for (let p = o; p; p = p.parent) if (names.some((n) => p.name.startsWith(n))) return true;
  return false;
};

// 写实材质也要和插画材质一样动：腿按步伐摆（髋部以下的顶点绕髋部高度的横轴转动，对角线两条腿同相），
// 脖子按权重弯曲（见 sheepShader.js 的 neckBend）
function withRig(material, hipY, neck, graze) {
  material.onBeforeCompile = (sh) => {
    let head = '';
    if (hipY != null) head += 'attribute vec2 aGait;\n';
    if (neck) {
      sh.uniforms.uPivot = { value: neck.pivot };
      sh.uniforms.uNeck = { value: neck.range };
      head += 'attribute vec2 aHead;\nuniform vec3 uPivot;\nuniform vec4 uNeck;\n' + NECK_GLSL;
    }
    if (graze) head += GRAZE_GLSL;
    sh.vertexShader = head + sh.vertexShader
      // 法线在位置之前就算了：在这里一起把脖子弯好，位置留到 begin_vertex 再用
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      vec3 rigPos = position;
      ${graze ? 'rigPos = grazePose(position, objectNormal, aHead.x);' : ''}
      ${neck ? `rigPos = neckBend(rigPos, objectNormal, ${graze ? 'vec2(0.0, aHead.y)' : 'aHead'}, uPivot, uNeck);` : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed = rigPos;
      ${hipY != null ? `{
        float hip = ${(hipY ?? 0).toFixed(4)};
        vec3 q = ${graze ? 'position' : 'transformed'};   // legs swing as in the standing pose
        float w = smoothstep(hip, hip - 0.12, q.y);
        if (w > 0.0 && aGait.y > 0.0) {
          bool front = q.z > 0.0;
          bool left = q.x > 0.0;
          float a = sin(aGait.x + (front == left ? 0.0 : 3.14159)) * aGait.y * w;
          float dy = q.y - hip;
          transformed.y += hip + dy * cos(a) - q.y;
          transformed.z += dy * sin(a);
        }
      }` : ''}`);
  };
  material.customProgramCacheKey = () => `rig${hipY ?? '-'}|${neck ? 'neck' : ''}|${graze ? 'graze' : ''}`;
  return material;
}

async function buildTemplate(def) {
  const gltf = def.build ? { scene: def.build() }
    : def.pack ? await loadPackedGLTF(def.pack, def.key) : await loader.loadAsync(def.url);
  applySpecGlossColors(gltf);
  const head = def.headNode ? gltf.scene.getObjectByName(def.headNode) : null;
  const outer = normalize(gltf.scene, head, def.height);
  const parts = [];
  const headBox = new THREE.Box3();
  let meshMatrix = null;
  outer.traverse((o) => {
    if (!o.isMesh) return;
    meshMatrix ??= o.matrixWorld.clone();
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    // baked poses (custom glTF attributes) go through the same normalising transform, under shader-friendly names
    const nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    for (const [src, dst, isNormal] of [['_mid_position', 'aMidPos'], ['_mid_normal', 'aMidNrm', true], ['_eat_position', 'aEatPos'], ['_eat_normal', 'aEatNrm', true]]) {
      const at = geo.getAttribute(src);
      if (!at) continue;
      if (isNormal) at.applyNormalMatrix(nm); else at.applyMatrix4(o.matrixWorld);   // applyNormalMatrix also re-normalises
      geo.deleteAttribute(src);
      geo.setAttribute(dst, at);
    }
    if (o.matrixWorld.determinant() < 0) {
      // 镜像变换会把三角形翻面
      const idx = geo.index;
      if (idx) for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
    }
    for (const k of Object.keys(geo.attributes)) if (k.startsWith('color')) geo.deleteAttribute(k);
    const name = (o.material.name || '') + ' ' + o.name;
    const override = Object.entries(def.colors || {}).find(([k]) => name.includes(k));
    let mat = o.material.clone();
    mat.vertexColors = false;
    if (def.wool?.includes(o.material.name) && mat.map) mat = woolMaterial(mat);
    if (override) mat.color.set(override[1]);
    if (mat.map) mat.map.anisotropy = 4;
    if (mat.normalMap) mat.normalMap.anisotropy = 4;
    const isHead = def.headParts ? inGroup(o, def.headParts) : false;
    if (isHead) { geo.computeBoundingBox(); headBox.union(geo.boundingBox); }
    parts.push({ geo, mat, isHead });
  });
  // 脖子的转轴：头部件包围盒靠后、偏下的位置
  const pivot = headBox.isEmpty()
    ? new THREE.Vector3()
    : new THREE.Vector3(0, headBox.min.y + (headBox.max.y - headBox.min.y) * 0.35, headBox.min.z + (headBox.max.z - headBox.min.z) * 0.15);
  // 脖子弯曲的范围（模型坐标）：沿前后方向从肩膀后面到脸，沿高度从胸口以上；
  // 头部件和身体用同一个权重，接缝两边的顶点动得一样，就不会裂开
  const H = def.height;
  let neck = headBox.isEmpty() ? null : {
    pivot,
    range: new THREE.Vector4(pivot.z - 0.15 * H, pivot.z + 0.12 * H, pivot.y - 0.27 * H, pivot.y - 0.13 * H),
  };
  if (def.neck && meshMatrix) {
    // an explicit neck, given in the model's own units: carry it through the same normalising transform
    const at = (y, z) => new THREE.Vector3(0, y, z).applyMatrix4(meshMatrix);
    const pv = at(...def.neck.pivot), lo = at(def.neck.y[0], def.neck.z[0]), hi = at(def.neck.y[1], def.neck.z[1]);
    neck = { pivot: pv, range: new THREE.Vector4(lo.z, hi.z, lo.y, hi.y) };
  }
  return { parts, pivot: neck?.pivot ?? pivot, neck };
}

// Full-resolution fur only where it pays off: a mouse-and-keyboard computer with a fair amount of memory
// (four 4K textures' worth of GPU memory is too much to ask of a phone)
const wantsHD = () => !matchMedia('(hover: none) and (pointer: coarse)').matches && (navigator.deviceMemory ?? 8) >= 4;
const hdLoads = new Map();
function loadHD(def, template) {
  if (!hdLoads.has(def.id)) {
    hdLoads.set(def.id, (async () => {
      await new Promise((r) => setTimeout(r, 1500));   // let the meadow get going first
      try {
        const gltf = await loadPackedGLTF(def.hd, def.key);
        let tex = null;
        gltf.scene.traverse((o) => { if (o.isMesh && !tex) tex = { map: o.material.map, normalMap: o.material.normalMap }; });
        if (!tex) return null;
        for (const t of [tex.map, tex.normalMap]) if (t) t.anisotropy = 4;
        // later looks built from the same template start with the full-resolution textures straight away
        for (const p of template.parts) {
          if (p.mat.map && tex.map) p.mat.map = tex.map;
          if (p.mat.normalMap && tex.normalMap) p.mat.normalMap = tex.normalMap;
        }
        return tex;
      } catch (e) {
        console.warn('full-resolution fur not loaded:', e);
        return null;
      }
    })());
  }
  return hdLoads.get(def.id);
}

export async function loadLook(id, scene) {
  const def = lookDef(id);
  if (!templates.has(def.id)) templates.set(def.id, buildTemplate(def));
  return new ModelLook(scene, await templates.get(def.id), def);
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _m3 = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _c = new THREE.Color();

// 每个部件一个 InstancedMesh（保留原来的贴图和材质），所有羊一起画
class ModelLook {
  constructor(scene, data, def) {
    this.scene = scene;
    this.def = def;
    this.pivot = data.pivot;
    this.neck = data.neck;
    const toon = def.style ? def.style === 'toon' : sheepToonEnabled();
    this.meshes = data.parts.map(({ geo, mat, isHead }) => {
      const g = geo.clone();
      const m = mat.clone();
      const hip = !isHead && def.hip ? def.hip * def.height : null;
      const neck = data.neck;
      if (hip != null) g.setAttribute('aGait', new THREE.InstancedBufferAttribute(new Float32Array(SHEEP_CAPACITY * 2), 2));
      if (neck) g.setAttribute('aHead', new THREE.InstancedBufferAttribute(new Float32Array(SHEEP_CAPACITY * 2), 2));
      if (hip != null || neck) withRig(m, hip, neck, def.graze);
      withClouds(m);
      // 两套材质：写实（PBR）和插画光影，开发面板里切换
      const toonMat = makeSheepMaterial({ map: mat.map, color: mat.color, side: mat.side, hip, neck, graze: def.graze });
      const mesh = new THREE.InstancedMesh(g, toon ? toonMat : m, SHEEP_CAPACITY);
      mesh.userData.materials = { real: m, toon: toonMat };
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.userData.isHead = isHead;
      scene.add(mesh);
      return mesh;
    });
    this.owners = [];
    if (def.hd && wantsHD()) loadHD(def, data).then((tex) => { if (tex && !this.disposed) this.useHD(tex); });
  }

  // the full-resolution fur has arrived: same mesh, sharper colour and normal map
  useHD({ map, normalMap }) {
    const old = new Set();
    for (const mesh of this.meshes) {
      const { real, toon } = mesh.userData.materials;
      if (real.map && map) { old.add(real.map); real.map = map; }
      if (real.normalMap && normalMap) { old.add(real.normalMap); real.normalMap = normalMap; }
      if (toon.uniforms?.map?.value && map) { old.add(toon.uniforms.map.value); toon.uniforms.map.value = map; }
    }
    for (const t of old) if (t !== map && t !== normalMap) t.dispose();   // frees the 2K copies on the GPU
  }

  add() {}
  remove() {}

  setStyle(toon) {
    for (const mesh of this.meshes) mesh.material = toon ? mesh.userData.materials.toon : mesh.userData.materials.real;
  }

  sync(list) {
    const n = Math.min(list.length, SHEEP_CAPACITY);
    const p = this.pivot;
    for (let i = 0; i < n; i++) {
      const s = list[i];
      const speed = Math.hypot(s.vx, s.vz);
      const graze = Math.max(0, s.pitch);
      // 身体：吃草时微微前倾，走路时左右轻晃
      const roll = Math.sin(s.phase) * 0.035 * Math.min(speed / 1.5, 1);
      _m2.makeRotationFromEuler(_e.set(graze * 0.06, 0, roll));
      _m.multiplyMatrices(s.tilt.matrixWorld, _m2);
      // 头：绕脖子低头吃草、转头张望（有脖子权重时在着色器里弯；没有的模型才把头部件整块转开）
      const hp = (Math.min(graze, 1.2) * 0.55 - 0.05) * (this.def.nod ?? 1), hy = s.yaw * 0.8;
      // baked grazing pose: aHead.x carries how far into it (0 standing … 1 grazing) instead of a nod angle
      const hx = this.def.graze ? THREE.MathUtils.smoothstep(graze, 0.15, 1.1) : hp;
      if (this.def.coats) s.coat ??= this.def.coats();
      if (!this.neck) {
        _m3.makeTranslation(p.x, p.y, p.z)
          .multiply(_m2.makeRotationFromEuler(_e.set(hp, hy, 0)))
          .multiply(_t.makeTranslation(-p.x, -p.y, -p.z));
        _m3.premultiply(_m);
      }
      const amp = Math.min(speed / 1.3, 1) * (speed > 2.4 ? 0.6 : 0.42);
      for (const mesh of this.meshes) {
        mesh.setMatrixAt(i, mesh.userData.isHead && !this.neck ? _m3 : _m);
        mesh.setColorAt(i, this.def.coats ? _c.copy(s.coat).multiplyScalar(s.tint) : _c.setScalar(s.tint));
        const gait = mesh.geometry.attributes.aGait;
        if (gait) { gait.array[i * 2] = s.phase; gait.array[i * 2 + 1] = amp; }
        const head = mesh.geometry.attributes.aHead;
        if (head) { head.array[i * 2] = hx; head.array[i * 2 + 1] = hy; }
      }
      this.owners[i] = s;
    }
    this.owners.length = n;
    for (const mesh of this.meshes) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (mesh.geometry.attributes.aGait) mesh.geometry.attributes.aGait.needsUpdate = true;
      if (mesh.geometry.attributes.aHead) mesh.geometry.attributes.aHead.needsUpdate = true;
    }
  }

  pick(raycaster) {
    let best = null, bd = Infinity;
    for (const mesh of this.meshes) {
      mesh.computeBoundingSphere();
      for (const h of raycaster.intersectObject(mesh, false)) {
        const s = this.owners[h.instanceId];
        if (s && s.state !== 'leave' && h.distance < bd) { bd = h.distance; best = s; }
      }
    }
    return best;
  }

  dispose() {
    this.disposed = true;
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.dispose();
      m.geometry.dispose();
      m.userData.materials.real.dispose();
      m.userData.materials.toon.dispose();
    }
  }
}
