/**
 * @OnlyCurrentDoc
 *
 * Shared alpaca names for ranranli.net/vibe-shepherding: a Google Apps Script bound to the "vibe-shepherding"
 * Google Sheet and deployed as a web app (Execute as: Me, Who has access: Anyone).
 *
 *   GET  …/exec                 → { ok: true, names: [{ id, name, t }] }   names from the last 36 hours, newest first
 *   POST …/exec  {"name":"…"}   → { ok: true, id, names } or { ok: false, error: 'length' | 'blocked' | 'busy' }
 *
 * At most 50 names are kept, one per alpaca: when a new name comes in and there are already 50, the oldest goes.
 * Moderation: delete a row in the "names" tab to remove a name for everyone (it disappears within about half a
 * minute). Names containing a word from the "blocked" tab (one word per row) are refused, as are links and slurs.
 * Rows older than 36 hours are cleaned up automatically whenever someone adds a name.
 *
 * The @OnlyCurrentDoc line limits the script's access to this one spreadsheet.
 */
const LIFETIME_MS = 36 * 60 * 60 * 1000;
const MAX_LEN = 24;
const MAX_ACTIVE = 50;          // one name per alpaca (the herd holds 50)
const MAX_PER_MINUTE = 20;      // all visitors together
const NAMES_SHEET = 'names';
const BLOCKED_SHEET = 'blocked';
const CACHE_KEY = 'names-v2';
const CACHE_SECONDS = 15;

// Slurs that are always refused, base64-encoded so they don't sit in the code as plain text. Whole words; the
// longer ones are also caught when spelled with gaps or symbols.
const DEFAULT_BLOCKED_B64 = 'bmlnZ2VyLG5pZ2dhLGZhZ2dvdCxmYWcscmV0YXJkLGtpa2UsY2hpbmssc3BpYyx0cmFubnksd2V0YmFjayxnb29rLGNvb24scmFnaGVhZCx0b3dlbGhlYWQscGFraQ==';

/** Run once from the editor to create the tabs (the web app also creates them when it needs them). */
function setup() {
  namesSheet_();
  blockedSheet_();
}

function doGet() {
  return json_({ ok: true, names: activeNames_() });
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { body = {}; }
  const name = String(body.name || '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > MAX_LEN) return json_({ ok: false, error: 'length' });
  if (/https?:|www\.|:\/\/|\.(com|net|org|io)\b/i.test(name) || isBlocked_(name)) return json_({ ok: false, error: 'blocked' });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return json_({ ok: false, error: 'busy' });
  try {
    const sh = namesSheet_();
    const now = Date.now();
    if (readRows_(sh).filter((r) => r.t > now - 60 * 1000 && r.t <= now + 60 * 1000).length >= MAX_PER_MINUTE) {
      return json_({ ok: false, error: 'busy' });
    }
    cleanup_(sh, now, MAX_ACTIVE - 1);   // drop expired names and, past the newest 49, the oldest ones
    const id = 'n' + Utilities.getUuid().replace(/-/g, '').slice(0, 9);
    // the leading apostrophe keeps every name as plain text (no formulas, and "1/2" doesn't turn into a date)
    sh.appendRow([id, "'" + name, new Date(now)]);
    CacheService.getScriptCache().remove(CACHE_KEY);
    return json_({ ok: true, id, names: activeNames_() });
  } finally {
    lock.releaseLock();
  }
}

function activeNames_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CACHE_KEY);
  if (hit) return JSON.parse(hit);
  const now = Date.now();
  const names = readRows_(namesSheet_())
    .filter((n) => n.id && n.name && n.t && now - n.t < LIFETIME_MS && n.t <= now + 60 * 1000)
    .sort((a, b) => b.t - a.t)
    .slice(0, MAX_ACTIVE)
    .map(({ id, name, t }) => ({ id, name, t }));
  cache.put(CACHE_KEY, JSON.stringify(names), CACHE_SECONDS);
  return names;
}

function readRows_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 3).getValues().map(([id, name, added], i) => ({
    row: i + 2,
    id: String(id).trim(),
    name: String(name).trim().slice(0, MAX_LEN),
    t: added instanceof Date ? added.getTime() : Number(added) || 0,
  }));
}

// Deletes rows older than 36 hours and, beyond the newest `keep`, the oldest rows.
function cleanup_(sh, now, keep) {
  const rows = readRows_(sh);
  const kept = new Set(rows.filter((r) => r.t && now - r.t < LIFETIME_MS)
    .sort((a, b) => b.t - a.t).slice(0, keep).map((r) => r.row));
  rows.map((r) => r.row).filter((row) => !kept.has(row)).sort((a, b) => b - a).forEach((row) => sh.deleteRow(row));
}

function namesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(NAMES_SHEET);
  if (!sh) {
    const first = ss.getSheets()[0];
    sh = first.getLastRow() === 0 && first.getLastColumn() === 0 ? first.setName(NAMES_SHEET) : ss.insertSheet(NAMES_SHEET);
    sh.getRange(1, 1, 1, 3).setValues([['id', 'name', 'added']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(2, 220);
    sh.setColumnWidth(3, 170);
  }
  return sh;
}

function blockedSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(BLOCKED_SHEET);
  if (!sh) {
    sh = ss.insertSheet(BLOCKED_SHEET);
    sh.getRange(1, 1).setValue('Blocked words: one per row below. Names containing any of them are refused.').setFontWeight('bold');
    sh.setColumnWidth(1, 520);
  }
  return sh;
}

function normalize_(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's').replace(/7/g, 't');
}

function isBlocked_(name) {
  const n = normalize_(name);
  const words = n.split(/[^a-z\u00c0-\uffff]+/).filter(Boolean);
  const squashed = words.join('');
  const sh = blockedSheet_();
  const extra = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map((r) => String(r[0]).trim()).filter(Boolean) : [];
  const builtIn = Utilities.newBlob(Utilities.base64Decode(DEFAULT_BLOCKED_B64)).getDataAsString().split(',');
  return builtIn.concat(extra).some((w) => {
    const b = normalize_(w).replace(/[^a-z\u00c0-\uffff]/g, '');
    if (!b) return false;
    return words.includes(b) || (b.length >= 5 && squashed.includes(b)) || (extra.includes(w) && n.includes(normalize_(w)));
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
