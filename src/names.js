import * as THREE from 'three';

// "Name an alpaca": a small box at the bottom left where visitors can give alpacas the names of people who annoyed
// them today. Each name floats above its own alpaca. The names stay only in this browser (localStorage) and disappear
// 36 hours after they were added; sending a named alpaca away (double-click) removes its name right away.
// On a reload the saved names find new alpacas, and alpacas are called in if there aren't enough to carry them.

const KEY = 'vibe-shepherding.names';
const LIFETIME = 36 * 60 * 60 * 1000;
const MAX_LEN = 24;

const CSS = `
#ym-namebox {
  position: fixed; left: 14px; bottom: 14px; z-index: 20; box-sizing: border-box;
  width: min(300px, calc(100vw - 28px)); padding: 10px 12px 9px; border-radius: 14px;
  background: rgba(255,255,255,.62); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  box-shadow: 0 6px 24px rgba(20,40,70,.16);
  font: 12.5px/1.45 -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", sans-serif; color: #24323f;
  opacity: .88; transition: opacity .25s;
  -webkit-user-select: text; user-select: text;
}
#ym-namebox:hover, #ym-namebox:focus-within { opacity: 1; }
#ym-namebox p { margin: 0; }
#ym-namebox form { display: flex; gap: 6px; margin: 8px 0 7px; }
#ym-namebox input {
  flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 6px 9px; border-radius: 9px;
  border: 1px solid rgba(36,50,63,.18); background: rgba(255,255,255,.88);
  font: inherit; font-size: max(12.5px, 1em); color: inherit; outline: none;
}
#ym-namebox input:focus { border-color: #7c9cc4; box-shadow: 0 0 0 3px rgba(124,156,196,.25); }
#ym-namebox input::placeholder { color: #8795a1; }
#ym-namebox button {
  flex: 0 0 auto; padding: 6px 12px; border: 0; border-radius: 9px;
  background: #24323f; color: #fff; font: inherit; font-weight: 600; cursor: pointer;
}
#ym-namebox button:hover { background: #3a4d5f; }
#ym-namebox .hint { font-size: 11.5px; color: #5b6b78; }
@media (max-width: 700px) {
  #ym-namebox { bottom: 34px; font-size: 12px; }   /* leave the credit line below free */
}

#ym-namelayer { position: fixed; inset: 0; z-index: 15; pointer-events: none; overflow: hidden; }
.ym-name {
  position: absolute; left: 0; top: 0; will-change: transform, opacity;
  max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 2px 9px; border-radius: 999px;
  background: rgba(255,255,255,.84); color: #24323f; box-shadow: 0 2px 10px rgba(20,40,70,.2);
  font: 600 12.5px/1.5 -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", sans-serif;
  opacity: 0;
}
`;

function load() {
  try {
    const now = Date.now();
    const list = JSON.parse(localStorage.getItem(KEY)) || [];
    return list.filter((n) => n && typeof n.name === 'string' && typeof n.t === 'number' && now - n.t < LIFETIME && n.t <= now + 60000);
  } catch {
    return [];
  }
}

function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

export function createNames({ flock, camera, addSheep, maxSheep }) {
  let names = load();
  save(names);

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const touchOnly = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const box = document.createElement('div');
  box.id = 'ym-namebox';
  box.lang = 'en';
  box.innerHTML = `
    <p class="msg">feel free to add names of those who annoyed you today to alpacas (e.g., dear supervisors or subordinates), names will disappear in 36 hours</p>
    <form>
      <input type="text" maxlength="${MAX_LEN}" placeholder="a name" aria-label="Name for an alpaca" autocomplete="off" spellcheck="false">
      <button type="submit">add</button>
    </form>
    <p class="hint">${touchOnly ? 'tap the meadow to add more alpacas' : 'press enter to add more alpacas'}</p>`;
  const layer = document.createElement('div');
  layer.id = 'ym-namelayer';
  document.body.append(layer, box);

  // clicks and taps on the box shouldn't reach the meadow
  box.addEventListener('pointerdown', (e) => e.stopPropagation());
  const input = box.querySelector('input');
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') input.blur(); });
  let placeholderTimer;
  box.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
    if (!name) return;
    if (names.length >= maxSheep) {
      input.value = '';
      input.placeholder = 'the herd is full for now';
      clearTimeout(placeholderTimer);
      placeholderTimer = setTimeout(() => { input.placeholder = 'a name'; }, 3000);
      return;
    }
    names.push({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, t: Date.now() });
    save(names);
    input.value = '';
    assign();
  });

  const v = new THREE.Vector3();
  const live = (s) => s.state !== 'leave';

  // Give every saved name an alpaca: preferably an unnamed one in view and close by, otherwise call a new one in.
  function assign() {
    const ids = new Set(names.map((n) => n.id));
    const carried = new Set();
    for (const s of flock.list) {
      if (!s.nameId) continue;
      if (!ids.has(s.nameId)) { s.nameId = null; s.name = null; } else if (live(s)) carried.add(s.nameId);
    }
    camera.updateMatrixWorld();
    for (const n of names) {
      if (carried.has(n.id)) continue;
      let best = null, bd = Infinity;
      for (const s of flock.list) {
        if (!live(s) || s.nameId) continue;
        v.copy(s.root.position).project(camera);
        const inView = v.z < 1 && Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.85;
        const d = s.root.position.distanceTo(camera.position) + (inView ? 0 : 1000);
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) best = addSheep();
      if (!best) break;   // the herd is at its limit, or there's no room to call one in right now
      best.nameId = n.id;
      best.name = n.name;
      carried.add(n.id);
    }
  }

  let assignT = 0, expireT = 0;
  const els = new Map();   // alpaca → its label
  function update(dt) {
    // a named alpaca that's been sent away takes its name with it
    let changed = false;
    for (const s of flock.list) {
      if (s.nameId && !live(s)) {
        names = names.filter((n) => n.id !== s.nameId);
        s.nameId = null;   // the label stays (s.name) and fades out as the alpaca leaves
        changed = true;
      }
    }
    if ((expireT -= dt) <= 0) {
      expireT = 30;
      const now = Date.now(), before = names.length;
      names = names.filter((n) => now - n.t < LIFETIME);
      if (names.length !== before) changed = true;
    }
    if (changed) save(names);
    if ((assignT -= dt) <= 0 || changed) { assignT = 0.5; assign(); }

    camera.updateMatrixWorld();
    const H = flock.look.def?.height ?? 1;
    const seen = new Set();
    for (const s of flock.list) {
      if (!s.name || (live(s) && !s.nameId)) continue;
      let el = els.get(s);
      if (!el) {
        el = document.createElement('div');
        el.className = 'ym-name';
        layer.appendChild(el);
        els.set(s, el);
      }
      if (el.textContent !== s.name) el.textContent = s.name;
      seen.add(s);
      v.copy(s.root.position);
      v.y += H * s.scale * 1.04 + 0.15;   // just above the head
      const dist = v.distanceTo(camera.position);
      v.project(camera);
      const fade = (1 - THREE.MathUtils.smoothstep(dist, 30, 50)) * (live(s) ? 1 : Math.max(0, Math.min(1, s.shrink ?? 1) * (1 - THREE.MathUtils.smoothstep(s.life ?? 0, 2, 5))));
      if (v.z > 1 || fade < 0.02 || Math.abs(v.x) > 1.3 || Math.abs(v.y) > 1.3) { el.style.opacity = '0'; continue; }
      el.style.opacity = fade.toFixed(2);
      el.style.transform = `translate(${((v.x + 1) * 0.5 * innerWidth).toFixed(1)}px, ${((1 - v.y) * 0.5 * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (const [s, el] of els) if (!seen.has(s)) { el.remove(); els.delete(s); }
  }

  return { update };
}
