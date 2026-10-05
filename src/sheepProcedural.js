import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 程序生成的小羊：这个克隆版用它代替原作里那只授权受限的 CGTrader 模型（见 CREDITS.md）。
// 交给 sheepModels.js 的方式和外部 glTF 模型一样：头朝 +Z、脚底在 y = 0；
// 头部的部件都在名为 head 的组里（低头吃草、转头张望时一起动），腿在髋部以下随步伐摆动。
// 羊毛是一团团的小毛球，法线朝整团毛的椭球弯过去：明暗交界是整块的，轮廓却是毛茸茸的。

// 固定种子的随机数：每次生成的羊都一样
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 羊毛贴图：浅灰底上一圈圈的小毛卷（亮的一笔、暗的一笔），四边无缝衔接。
// 平均亮度和写实羊毛贴图差不多（着色器按这个亮度定了亮面颜色，见 sheepShader.js 的 WOOL_GAIN）。
// 毛卷按网格均匀撒（每格一亮一暗）：模糊的几级 mipmap 几乎是平的，着色器拿它做的凹凸就不会在明暗交界处起噪点
function woolTexture() {
  const N = 256, CELLS = 32, C = N / CELLS;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#dedad2';
  ctx.fillRect(0, 0, N, N);
  const rand = rng(7);
  ctx.lineCap = 'round';
  const curl = (x, y, style) => {
    const r = 2.2 + rand() * 3.2, a0 = rand() * Math.PI * 2, sweep = Math.PI * (1.1 + rand() * 0.8);
    ctx.strokeStyle = style;
    ctx.lineWidth = 1 + rand() * 1.4;
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      if (x + dx < -10 || x + dx > N + 10 || y + dy < -10 || y + dy > N + 10) continue;
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, r, a0, a0 + sweep);
      ctx.stroke();
    }
  };
  for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) {
    curl((i + rand()) * C, (j + rand()) * C, `rgba(122,112,98,${(0.22 + rand() * 0.16).toFixed(3)})`);
    curl((i + rand()) * C, (j + rand()) * C, `rgba(255,253,247,${(0.5 + rand() * 0.25).toFixed(3)})`);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// 把法线朝椭球（中心 c、半轴 r）的法线弯过去；keep 是留下多少毛球自己的法线
function bendNormals(geo, c, r, keep) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const v = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(c);
    b.set(v.x / (r.x * r.x), v.y / (r.y * r.y), v.z / (r.z * r.z)).normalize();
    n.fromBufferAttribute(nrm, i).multiplyScalar(keep).addScaledVector(b, 1 - keep).normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  nrm.needsUpdate = true;
  return geo;
}

// 一团羊毛：一个椭球的芯，表面均匀铺满大小不一的小毛球（斐波那契球面取点）
// （小的毛团用更少的面：几十只羊一起画，还要画进阴影里）
function woolMass(rand, { center, radii, count, size: [s0, s1], keep = 0.3 }) {
  const big = Math.max(radii.x, radii.y, radii.z) > 0.15;
  const [pw, ph] = s1 > 0.06 ? [8, 6] : [7, 5];
  const geos = [new THREE.SphereGeometry(1, big ? 20 : 12, big ? 14 : 8).scale(radii.x, radii.y, radii.z).translate(center.x, center.y, center.z)];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    const th = i * golden + rand() * 0.4;
    const k = 0.93 + rand() * 0.09;
    const s = s0 + (s1 - s0) * rand();
    geos.push(new THREE.SphereGeometry(s, pw, ph)
      .rotateX(rand() * Math.PI).rotateY(rand() * Math.PI * 2)
      .translate(Math.cos(th) * r * radii.x * k + center.x, y * radii.y * k + center.y, Math.sin(th) * r * radii.z * k + center.z));
  }
  return bendNormals(mergeGeometries(geos), center, radii, keep);
}

const ellipsoid = (rx, ry, rz, w = 20, h = 14) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);

export function buildProceduralSheep() {
  const rand = rng(20261005);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const mat = (name, color, extra) => new THREE.MeshStandardMaterial({ name, color, roughness: 0.9, ...extra });
  const wool = mat('wool', '#fff9f0', { map: woolTexture(), roughness: 1 });
  const skin = mat('skin', '#9c8163');
  const shank = mat('leg', '#5c4c41');
  const hoof = mat('hoof', '#2e2622');
  const muzzle = mat('nose', '#5e4640');
  const eye = mat('eye', '#0c0a09', { roughness: 0.35 });

  const root = new THREE.Group();
  root.name = 'sheep';
  const mesh = (geo, material, name, parent = root) => {
    const m = new THREE.Mesh(geo, material);
    m.name = name;
    parent.add(m);
    return m;
  };

  // 四条腿的位置（左右、前后）
  const FEET = [[0.1, 0.2], [-0.1, 0.2], [0.1, -0.24], [-0.1, -0.24]];

  // 身体、脖子、尾巴、腿上半截的“毛裤”：同一种羊毛，拼成一个网格
  mesh(mergeGeometries([
    woolMass(rand, { center: V(0, 0.49, -0.03), radii: V(0.21, 0.175, 0.34), count: 62, size: [0.075, 0.105] }),
    woolMass(rand, { center: V(0, 0.58, 0.3), radii: V(0.1, 0.105, 0.11), count: 18, size: [0.055, 0.075] }),
    woolMass(rand, { center: V(0, 0.5, -0.4), radii: V(0.065, 0.07, 0.055), count: 8, size: [0.04, 0.055] }),
    ...FEET.map(([x, z]) => woolMass(rand, { center: V(x, 0.29, z), radii: V(0.055, 0.06, 0.055), count: 10, size: [0.035, 0.05] })),
  ]), wool, 'body');

  // 腿（上端藏在毛裤里）和蹄子
  mesh(mergeGeometries(FEET.map(([x, z]) => new THREE.CylinderGeometry(0.045, 0.034, 0.33, 8, 1).translate(x, 0.195, z))), shank, 'legs');
  mesh(mergeGeometries(FEET.map(([x, z]) => new THREE.CylinderGeometry(0.036, 0.04, 0.05, 8, 1).translate(x, 0.025, z))), hoof, 'hooves');

  // 头：先在脸的坐标里摆好（原点在脸的中心、鼻子朝 +Z），再一起低一点头、挪到脖子前面。
  // 脸、额头上一撮毛、往两边耷拉的耳朵、眼睛和鼻头
  const head = new THREE.Group();
  head.name = 'head';
  root.add(head);
  const place = (g) => g.rotateX(0.4).translate(0, 0.67, 0.56);
  mesh(place(ellipsoid(0.078, 0.088, 0.15, 16, 12)), skin, 'head_face', head);
  mesh(place(woolMass(rand, { center: V(0, 0.075, -0.045), radii: V(0.068, 0.042, 0.07), count: 12, size: [0.035, 0.05] })), wool, 'head_wool', head);
  mesh(place(mergeGeometries([1, -1].map((s) =>
    ellipsoid(0.07, 0.016, 0.034, 12, 8).rotateZ(-s * 0.4).rotateY(s * 0.25).translate(s * 0.11, 0.035, -0.055)))), skin, 'head_ears', head);
  mesh(place(mergeGeometries([1, -1].map((s) =>
    new THREE.SphereGeometry(0.016, 8, 6).translate(s * 0.066, 0.03, 0.04)))), eye, 'head_eyes', head);
  mesh(place(ellipsoid(0.048, 0.034, 0.03, 12, 8).translate(0, -0.005, 0.133)), muzzle, 'head_nose', head);

  return root;
}
