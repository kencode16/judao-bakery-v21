// 存檔（主代理擁有）。localStorage，讀寫都包 try/catch；壞掉就用預設值。
// v2：分「易」easy／「中」mid 兩種難度，關卡星星與圖鑑各自記；設定、教學看過與否共用。
// v2.1：存檔鍵改 jdlh21-save。第一次打開時，「易」帶入 v2.0（jdlh2-save）的進度；沒有 v2.0 就帶入 v1.1（jdlh-save-v1）。
// 「中」的關卡在 v2.1 重新設計過（同甜點分色），所以「中」從頭開始。舊存檔都不動（同網域 kencode16.github.io 讀得到）。
import { LEVELS } from './data/levels.js';
import { LEVELS as LEVELS_MID } from './data/levels_mid.js';
import { DESSERTS } from './data/desserts.js';

const KEY = 'jdlh21-save';
const V2_KEY = 'jdlh2-save';
const OLD_KEY = 'jdlh-save-v1';
const MODES = ['easy', 'mid'];
const LEVELS_OF = { easy: LEVELS, mid: LEVELS_MID };
const UNLOCK_ALL = new URLSearchParams(location.search).has('unlockall');

const freshMode = () => ({ stars: {}, unlocked: [], bookSeen: {} });
const fresh = () => ({
  v: 2, mode: 'easy', modeChosen: false, imported: false,
  modes: { easy: freshMode(), mid: freshMode() },
  seen: {}, settings: { music: true, sfx: true },
});

function readJSON(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function normalize(d) {
  const f = fresh();
  if (!d || typeof d !== 'object') return f;
  const out = { ...f, ...d, settings: { ...f.settings, ...(d.settings || {}) }, seen: { ...(d.seen || {}) } };
  out.modes = {};
  for (const m of MODES) out.modes[m] = { ...freshMode(), ...((d.modes || {})[m] || {}) };
  if (!MODES.includes(out.mode)) out.mode = 'easy';
  return out;
}
function load() {
  const d = normalize(readJSON(KEY));
  if (!d.imported) {
    // v2.0 的「易」→ 「易」（設定、教學看過、選過難度也帶過來）。只做一次；舊存檔原封不動
    const v2 = readJSON(V2_KEY);
    const v2easy = v2 && v2.modes && v2.modes.easy;
    if (v2easy) {
      const e = d.modes.easy;
      e.stars = { ...(v2easy.stars || {}), ...e.stars };
      e.unlocked = [...new Set([...(v2easy.unlocked || []), ...e.unlocked])];
      e.bookSeen = { ...(v2easy.bookSeen || {}), ...e.bookSeen };
      d.seen = { ...(v2.seen || {}), ...d.seen };
      if (v2.settings) d.settings = { ...d.settings, ...v2.settings };
      if (v2.modeChosen) { d.modeChosen = true; d.mode = v2.mode === 'mid' ? 'mid' : 'easy'; }
      d.importedFromV1 = true;
    }
    // 沒有 v2.0 存檔才看 v1.1：v1.1 舊存檔 → 「易」
    const old = v2easy ? null : readJSON(OLD_KEY);
    if (old && typeof old === 'object') {
      const e = d.modes.easy;
      e.stars = { ...(old.stars || {}), ...e.stars };
      e.unlocked = [...new Set([...(old.unlocked || []), ...e.unlocked])];
      e.bookSeen = { ...(old.bookSeen || {}), ...e.bookSeen };
      d.seen = { ...(old.seen || {}), ...d.seen };
      if (old.settings) d.settings = { ...d.settings, ...old.settings };
      d.importedFromV1 = true;
    }
    d.imported = true;
    data = d; write();
  }
  return d;
}
let data = fresh();
function write() {
  if (UNLOCK_ALL) return;            // 開發模式不寫入
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 私密模式等，忽略 */ }
}
data = load();
if (UNLOCK_ALL) {
  for (const m of MODES) {
    LEVELS_OF[m].forEach(l => { data.modes[m].stars[l.id] = data.modes[m].stars[l.id] || 3; });
    data.modes[m].unlocked = DESSERTS.map(d => d.id);
  }
}

const M = mode => data.modes[MODES.includes(mode) ? mode : data.mode];
const levelsOf = mode => LEVELS_OF[MODES.includes(mode) ? mode : data.mode];

export const save = {
  /** 目前難度：'easy'（易）| 'mid'（中） */
  mode: () => data.mode,
  setMode(m) { if (MODES.includes(m)) { data.mode = m; data.modeChosen = true; write(); } },
  /** 玩家選過難度沒（第一次按開始時要先選） */
  modeChosen: () => !!data.modeChosen,
  /** 是否從 v1.1 帶進了舊進度（首頁可以提示一次） */
  importedFromV1: () => !!data.importedFromV1,

  // 以下的 mode 參數都可省略＝目前難度
  levelStars: (id, mode) => M(mode).stars[id] || 0,
  isLevelOpen: (id, mode) => id === 1 || (M(mode).stars[id - 1] || 0) > 0,
  /** 過關時呼叫。第一次過關會依該難度關卡的 unlocks 解鎖甜點（易、中的圖鑑分開）。 */
  recordLevel(id, stars, mode) {
    const s = M(mode);
    const before = s.stars[id] || 0;
    const firstClear = before === 0;
    s.stars[id] = Math.max(before, stars);
    let newlyUnlocked = [];
    if (firstClear) {
      const lv = levelsOf(mode).find(l => l.id === id);
      newlyUnlocked = (lv?.unlocks || []).filter(d => !s.unlocked.includes(d));
      s.unlocked.push(...newlyUnlocked);
    }
    write();
    return { firstClear, bestStars: s.stars[id], newlyUnlocked };
  },
  isUnlocked: (id, mode) => M(mode).unlocked.includes(id),
  unlockedList: mode => [...M(mode).unlocked],
  isNewInBook: (id, mode) => M(mode).unlocked.includes(id) && !M(mode).bookSeen[id],
  markBookSeen(id, mode) { const s = M(mode); if (!s.bookSeen[id]) { s.bookSeen[id] = 1; write(); } },
  totalStars: mode => Object.values(M(mode).stars).reduce((a, b) => a + b, 0),
  /** 目前該玩的關（第一個還沒過的關；全過了回傳最後一關） */
  currentLevel(mode) {
    const L = levelsOf(mode), s = M(mode);
    for (const l of L) if (!s.stars[l.id]) return l.id;
    return L.length ? L[L.length - 1].id : 1;
  },

  // 共用（不分難度）
  settings: () => ({ ...data.settings }),
  setSetting(k, v) { data.settings[k] = v; write(); },
  seen: k => !!data.seen[k],
  markSeen(k) { data.seen[k] = 1; write(); },
  /** 只清某個難度的星星與圖鑑 */
  resetMode(mode) { if (MODES.includes(mode)) { data.modes[mode] = freshMode(); write(); } },
  /** 全部重來（設定保留） */
  reset() { const st = data.settings; data = { ...fresh(), imported: true, settings: st }; write(); },
};
