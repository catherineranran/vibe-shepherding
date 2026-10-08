import * as THREE from 'three';

// "Name an alpaca": a small box at the bottom left where visitors give alpacas the names of people who annoyed them
// today. The names are shared by everyone visiting: they're kept in a Google Sheet, reached through a small Apps Script
// web app (tools/names-apps-script.gs), and disappear 36 hours after they were added (or sooner, once 50 newer names
// have come in: one name per alpaca). Each name floats above its own alpaca, and more alpacas are called in when there
// aren't enough to carry them all. Sending a named alpaca away (double-click) hides that name for you only.

const API = 'https://script.google.com/macros/s/AKfycbwh2lVFZ9dCXI7z0MqlUj4SqF4e9UaxAS0Q87GxWHmY9wHmw5MxTZE1BVm-_lIJ-9jEqA/exec';
const HIDDEN_KEY = 'vibe-shepherding.hidden-names';
const LIFETIME = 36 * 60 * 60 * 1000;
const MAX_LEN = 24;
const POLL = 20;            // seconds between refreshes while the page is open
const MAX_POLL = 160;       // backing off to this while the sheet can't be reached
const TRUST = 90 * 1000;    // a name added from this page stays up this long even if a refresh doesn't list it yet
const SPAWNS_PER_STEP = 3;  // alpacas called in at a time (every half second) to carry names

const MESSAGES = {
  blocked: "that name can't be used, try another one",
  busy: 'lots of names right now, try again in a minute',
  full: 'the herd is full for now, try again later',
  length: `names can be up to ${MAX_LEN} characters`,
  network: "couldn't reach the meadow, try again",
};

const CSS = `
#ym-namebox {
  position: fixed; left: 14px; bottom: 14px; z-index: 20; box-sizing: border-box;
  width: min(300px, calc(100vw - 28px)); padding: 10px 12px 9px; border-radius: 14px;
  background: rgba(255,255,255,.8);   /* no backdrop blur: blurring the moving meadow behind it costs every frame */
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
#ym-namebox .hint.warn { color: #a8452b; }
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

const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);

// names from the sheet, checked and trimmed: [{ id, name, t }]
function fromServer(list) {
  return (Array.isArray(list) ? list : [])
    .map((n) => ({ id: String(n?.id ?? ''), name: cleanName(n?.name), t: Number(n?.t) }))
    .filter((n) => n.id && n.name && n.t);
}

function loadHidden() {
  try {
    const now = Date.now();
    const obj = JSON.parse(localStorage.getItem(HIDDEN_KEY)) || {};
    return Object.fromEntries(Object.entries(obj).filter(([, t]) => typeof t === 'number' && now - t < LIFETIME));
  } catch {
    return {};
  }
}

function saveHidden(hidden) {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden)); } catch {}
}

async function getNames() {
  const res = await fetch(API, { cache: 'no-store' });
  const data = await res.json();
  if (!data?.ok) throw new Error('names: bad response');
  return fromServer(data.names);
}

async function postName(name) {
  try {
    // text/plain keeps this a "simple" request, so the browser doesn't need a CORS preflight that Apps Script can't answer
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ name }) });
    return await res.json();
  } catch {
    return { ok: false, error: 'network' };
  }
}

export function createNames({ flock, camera, addSheep, maxSheep }) {
  let server = [];              // names in the sheet, newest first
  const mine = new Map();       // id → name added from this page (with `at`, when it was confirmed)
  let pending = [];             // names on their way to the sheet
  let hidden = loadHidden();    // id → time added, for names this visitor sent away
  let names = [];               // what's shown: newest first, at most one per alpaca
  saveHidden(hidden);

  function rebuild() {
    const now = Date.now();
    const list = [...server];
    for (const m of mine.values()) if (now - m.at < TRUST && !server.some((n) => n.id === m.id)) list.push(m);
    list.sort((a, b) => b.t - a.t);
    names = [...pending, ...list].filter((n) => !hidden[n.id] && now - n.t < LIFETIME).slice(0, maxSheep);
  }

  // —— the box ——
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const touchOnly = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const HINT = touchOnly ? 'tap the meadow to add more alpacas' : 'press enter to add more alpacas';
  const PLACEHOLDER = 'a name (everyone can see it)';
  const box = document.createElement('div');
  box.id = 'ym-namebox';
  box.lang = 'en';
  box.innerHTML = `
    <p class="msg">feel free to add names of those who annoyed you today to alpacas (e.g., dear supervisors or subordinates), names will disappear in 36 hours</p>
    <form>
      <input type="text" maxlength="${MAX_LEN}" placeholder="${PLACEHOLDER}" aria-label="Name for an alpaca" autocomplete="off" spellcheck="false" enterkeyhint="done">
      <button type="submit">add</button>
    </form>
    <p class="hint" aria-live="polite">${HINT}</p>`;
  const layer = document.createElement('div');
  layer.id = 'ym-namelayer';
  document.body.append(layer, box);

  const input = box.querySelector('input');
  const hint = box.querySelector('.hint');
  let sayTimer;
  function say(msg) {
    hint.textContent = msg;
    hint.classList.add('warn');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { hint.textContent = HINT; hint.classList.remove('warn'); }, 4500);
  }

  // clicks and taps on the box shouldn't reach the meadow
  box.addEventListener('pointerdown', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') input.blur(); });

  let tmpN = 0, seq = 0, applied = 0;
  box.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = cleanName(input.value);
    if (!name) { addSheep(); return; }   // an empty box: Enter just calls another alpaca
    input.value = '';
    const tmp = { id: `tmp${++tmpN}`, name, t: Date.now() };
    pending.unshift(tmp);   // show it straight away; the sheet confirms it a second or two later
    rebuild();
    assign();

    const res = await postName(name);
    pending = pending.filter((p) => p !== tmp);
    if (res?.ok && res.id) {
      const id = String(res.id);
      const entry = fromServer(res.names).find((n) => n.id === id) || { id, name, t: Date.now() };
      mine.set(id, { ...entry, at: Date.now() });
      for (const s of flock.list) if (s.nameId === tmp.id) s.nameId = id;   // the same alpaca keeps the name
      if (hidden[tmp.id]) { hidden[id] = entry.t; saveHidden(hidden); }
      if (Array.isArray(res.names)) { server = fromServer(res.names); applied = ++seq; }
    } else {
      say(MESSAGES[res?.error] || MESSAGES.network);
      if (res?.error !== 'blocked' && !input.value) input.value = name;
    }
    rebuild();
    assign();
  });

  // —— keeping up with everyone else's names ——
  let inflight = false, pollT = 0, interval = POLL;
  async function refresh() {
    inflight = true;
    const my = ++seq;
    try {
      const list = await getNames();
      if (my > applied) { applied = my; server = list; rebuild(); assign(); }
      interval = POLL;
    } catch {
      interval = Math.min(MAX_POLL, interval * 2);
    } finally {
      inflight = false;
      pollT = interval;
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pollT = 0; });

  // —— alpacas ——
  const v = new THREE.Vector3();
  const live = (s) => s.state !== 'leave';

  // Give every name an alpaca: preferably an unnamed one in view and close by, otherwise call a new one in.
  function assign() {
    const byId = new Map(names.map((n) => [n.id, n]));
    const carried = new Set();
    for (const s of flock.list) {
      if (!s.nameId) continue;
      const n = byId.get(s.nameId);
      if (!n) { s.nameId = null; s.name = null; } else if (live(s)) { carried.add(s.nameId); s.name = n.name; }
    }
    camera.updateMatrixWorld();
    let spawns = SPAWNS_PER_STEP;
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
      if (!best && spawns-- > 0) best = addSheep();
      if (!best) break;   // the herd is at its limit or there's no room right now: the rest wait for the next round
      best.nameId = n.id;
      best.name = n.name;
      carried.add(n.id);
    }
  }

  let assignT = 0, expireT = 30;
  const els = new Map();   // alpaca → its label
  function update(dt) {
    // a named alpaca that's been sent away takes its name with it (for this visitor)
    let changed = false;
    for (const s of flock.list) {
      if (s.nameId && !live(s)) {
        hidden[s.nameId] = names.find((n) => n.id === s.nameId)?.t ?? Date.now();
        s.nameId = null;   // the label stays (s.name) and fades out as the alpaca leaves
        changed = true;
      }
    }
    if ((expireT -= dt) <= 0) {   // names past 36 hours go, and so do the hidden ones
      expireT = 30;
      const now = Date.now();
      hidden = Object.fromEntries(Object.entries(hidden).filter(([, t]) => now - t < LIFETIME));
      changed = true;
    }
    if (changed) { saveHidden(hidden); rebuild(); }
    if (!inflight && document.visibilityState === 'visible' && (pollT -= dt) <= 0) refresh();
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
