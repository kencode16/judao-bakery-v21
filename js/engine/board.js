// 菊島連連烘：連連看引擎（A 引擎擁有）
// 純邏輯、不碰 DOM，Node 和瀏覽器都能跑；同一個 seed 結果完全一樣（自己的 mulberry32，不用 Math.random）。
// 規則與 API 合約見 架構.md「A 引擎」；用法範例見 js/engine/README.md。
//
// 內部座標：盤面外加一圈虛擬空格，padded 索引 p = (r + 1) * W + (c + 1)，W = cols + 2。
// 對外座標一律是 [r, c]（0 起算），外圍虛擬格是 r = -1 / rows、c = -1 / cols。
//
// v2.1 變色方塊：方塊代號可以是 '甜點代號@顏色'（例 'donut@blue'）。配對、kinds、counts、點單、
// b.tiles()、steps 一律用完整的方塊代號；只有查甜點資料（D 關的飲品）時才用 baseKind 拿掉 @ 後面。
import { DESSERT_BY_ID, DRINK_BY_ID } from '../data/desserts.js';
import { VARIANT_BG, splitKind, baseKind } from '../config.js';

const HOLE = 1, ICING = 2, JAM = 4, GIFT = 8;
const LOCK = JAM | GIFT;          // 不能選、也不能被滑動
const SOLID = HOLE | ICING;       // 不能放 tile 的格子
const KEY = 'key';
const SLIDE_DIRS = ['none', 'down', 'up', 'left', 'right', 'center', 'cycle'];
// cycle（每消一次換方向）的順序：下 → 左 → 上 → 右 → 下…
const CYCLE = ['down', 'left', 'up', 'right'];
const SHUFFLE_TRIES = 200;
const ADJ_ITERS = 4000;            // 開局「放一起」修正最多幾輪（實際關卡通常幾十輪就好）

/* ------------------------------------------------------------------ */
/* 建立盤面                                                            */
/* ------------------------------------------------------------------ */

/**
 * @param levelDef 關卡定義（格式見 架構.md「E 關卡」）
 *   v2.1：levelDef.openAdjMax（選填）＝開局盤面「放一起」的可配一對最多幾組（見 _fixOpenAdj、README）；省略＝完全照舊。
 * @param opts { seed }：seed 省略時用 levelDef.seed。
 *   （測試用、非正式 API：layout＝rows×cols 的 kind 陣列，直接指定盤面；noFix＝開局不保證有步）
 */
export function createBoard(levelDef, opts = {}) {
  if (!levelDef || typeof levelDef !== 'object') throw new Error('createBoard：需要 levelDef');
  const where = `第 ${levelDef.id ?? '?'} 關`;
  const fail = msg => { throw new Error(`createBoard（${where}）：${msg}`); };

  const rows = levelDef.rows | 0, cols = levelDef.cols | 0;
  if (rows < 1 || cols < 1 || rows > 40 || cols > 40) fail(`rows／cols 不合理（${levelDef.rows}×${levelDef.cols}）`);
  const slide = levelDef.slide || 'none';
  if (!SLIDE_DIRS.includes(slide)) fail(`slide 只能是 ${SLIDE_DIRS.join('/')}，收到 ${slide}`);
  const pairing = !!levelDef.pairing;
  // v2.1「中」：開局盤面「放一起」的一對最多幾組（null／省略＝不限制，發牌和以前完全一樣、不多用亂數）
  const adjMax = levelDef.openAdjMax ?? null;
  if (adjMax != null && !(Number.isInteger(adjMax) && adjMax >= 0)) fail(`openAdjMax 要是 0 以上的整數（省略＝不限制），收到 ${levelDef.openAdjMax}`);

  const W = cols + 2, H = rows + 2, N = W * H;
  const P = (r, c) => (r + 1) * W + (c + 1);
  const f = new Uint8Array(N);

  // 盤面形狀
  if (levelDef.mask) {
    const mask = levelDef.mask;
    if (!Array.isArray(mask) || mask.length !== rows) fail('mask 要是 rows 個字串');
    for (let r = 0; r < rows; r++) {
      const line = mask[r];
      if (typeof line !== 'string' || line.length !== cols) fail(`mask 第 ${r} 列長度要是 ${cols}`);
      for (let c = 0; c < cols; c++) {
        const ch = line[c];
        if (ch === '#') f[P(r, c)] |= HOLE;
        else if (ch !== '.') fail(`mask 只能用 '.' 和 '#'，第 ${r} 列有 '${ch}'`);
      }
    }
  }
  const mark = (list, bit, name) => {
    for (const rc of list || []) {
      if (!Array.isArray(rc) || rc.length !== 2) fail(`${name} 的座標格式要是 [r, c]`);
      const [r, c] = rc;
      if (!(r >= 0 && r < rows && c >= 0 && c < cols) || (r | 0) !== r || (c | 0) !== c) fail(`${name} 座標 [${r},${c}] 超出盤面`);
      const p = P(r, c);
      if (f[p] & HOLE) fail(`${name} 座標 [${r},${c}] 是空洞`);
      if (f[p] & (ICING | JAM | GIFT)) fail(`[${r},${c}] 同時有兩種障礙`);
      f[p] |= bit;
    }
  };
  mark(levelDef.icing, ICING, 'icing');
  mark(levelDef.jam, JAM, 'jam');
  mark(levelDef.gifts, GIFT, 'gifts');
  const giftN = (levelDef.gifts || []).length;

  // 種類表：甜點 → （D 關）飲品 → （有禮盒）鑰匙
  const desserts = levelDef.kinds;
  if (!Array.isArray(desserts) || desserts.length === 0) fail('kinds 不能是空的');
  if (new Set(desserts).size !== desserts.length) fail('kinds 有重複');
  if (desserts.includes(KEY)) fail(`'${KEY}' 是鑰匙保留字，不能放在 kinds`);
  checkVariants(levelDef, desserts, pairing, fail);
  const kinds = [...desserts];
  const partner = [];
  if (pairing) {
    const drinks = desserts.map(d => {
      const info = DESSERT_BY_ID[baseKind(d)];
      if (!info || !info.drink) fail(`D 關找不到甜點 ${d} 的主要飲品`);
      return info.drink;
    });
    const dup = drinks.find((d, i) => drinks.indexOf(d) !== i);
    if (dup) fail(`D 關有兩個甜點都配 ${dup}，答案不唯一`);
    const k = desserts.length;
    drinks.forEach((d, i) => { kinds.push(d); partner[i] = k + i; partner[k + i] = i; });
  } else {
    desserts.forEach((_, i) => { partner[i] = i; });
  }
  // layout（測試用）可以出現 kinds 以外的種類
  const layout = opts.layout || null;
  if (layout && !pairing) {
    for (const row of layout) for (const v of row) {
      if (v != null && v !== KEY && !kinds.includes(v)) { partner[kinds.length] = kinds.length; kinds.push(v); }
    }
  }
  let keyK = -1;
  if (giftN > 0 || (layout && layout.some(row => row.includes(KEY)))) {
    keyK = kinds.length; kinds.push(KEY); partner[keyK] = keyK;
  }
  const K = kinds.length;
  const kIndex = Object.fromEntries(kinds.map((k, i) => [k, i]));

  // 亂數
  const st = { rs: seedToU32(opts.seed ?? levelDef.seed ?? levelDef.id ?? 1) };
  const rand = () => mulberry(st);
  const shuffleArr = a => { for (let i = a.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

  const kArr = new Int16Array(N).fill(-1);
  const placeable = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const p = P(r, c); if (!(f[p] & SOLID)) placeable.push(p); }

  if (layout) {
    // 測試用：直接照 layout 放
    if (!Array.isArray(layout) || layout.length !== rows) fail('layout 要是 rows 列');
    for (let r = 0; r < rows; r++) {
      if (!Array.isArray(layout[r]) || layout[r].length !== cols) fail(`layout 第 ${r} 列要有 ${cols} 格`);
      for (let c = 0; c < cols; c++) {
        const v = layout[r][c], p = P(r, c);
        if (v == null) continue;
        if (f[p] & SOLID) fail(`layout [${r},${c}] 是空洞或糖霜磚，不能放 tile`);
        if (!(v in kIndex)) fail(`layout [${r},${c}] 的 ${v} 不在種類表`);
        kArr[p] = kIndex[v];
      }
    }
  } else {
    // 開局發牌
    const S = placeable.length;
    const keysN = giftN > 0 ? 2 : 0;
    const cap = S - keysN;
    const cnt = new Array(K).fill(0);
    const counts = levelDef.counts || null;
    if (counts) for (const key of Object.keys(counts)) if (!desserts.includes(key)) fail(`counts 裡的 ${key} 不在 kinds`);
    let used = 0;
    const free = [];
    desserts.forEach((d, i) => {
      if (counts && counts[d] != null) {
        const n = counts[d];
        if (!Number.isInteger(n) || n <= 0) fail(`counts.${d} 要是正整數`);
        if (!pairing && n % 2) fail(`counts.${d} 要是偶數`);
        cnt[i] = n;
        if (pairing) cnt[partner[i]] = n;
        used += pairing ? 2 * n : n;
      } else free.push(i);
    });
    if (free.length) {
      const pairs = Math.floor((cap - used) / 2);
      const base = Math.floor(pairs / free.length), extra = pairs % free.length;
      free.forEach((i, j) => {
        const pr = base + (j < extra ? 1 : 0);
        if (pr <= 0) fail(`盤面放不下，${desserts[i]} 分不到任何一對`);
        if (pairing) { cnt[i] = pr; cnt[partner[i]] = pr; } else cnt[i] = pr * 2;
      });
    }
    if (keysN) cnt[keyK] = 2;
    const total = cnt.reduce((a, b) => a + b, 0);
    if (total > S) fail(`tile 共 ${total} 個，可放的格子只有 ${S} 格`);
    const plain = placeable.filter(p => !(f[p] & LOCK));
    const special = placeable.filter(p => f[p] & LOCK);
    if (special.length > total - keysN) fail(`果醬＋禮盒有 ${special.length} 格，比甜點數 ${total - keysN} 還多`);
    shuffleArr(plain);
    const emptyN = S - total;
    for (let i = 0; i < keysN; i++) kArr[plain[i]] = keyK;
    const fillCells = plain.slice(keysN + emptyN).concat(special);
    const bag = [];
    cnt.forEach((n, i) => { if (i !== keyK) for (let j = 0; j < n; j++) bag.push(i); });
    shuffleArr(bag);
    fillCells.forEach((p, i) => { kArr[p] = bag[i]; });
  }

  // 果醬、禮盒底下一定要有 tile
  for (let p = 0; p < N; p++) if ((f[p] & LOCK) && kArr[p] < 0) fail('果醬或禮盒格底下沒有 tile（layout 有誤）');

  const meta = {
    rows, cols, W, H, N, K, kinds, kIndex, partner: Int16Array.from(partner), keyK,
    isDrink: kinds.map(k => !!DRINK_BY_ID[k]),
    pairing, slide, newKind: levelDef.newDessert || null,
    pairOfName: Object.fromEntries(kinds.map((k, i) => [k, kinds[partner[i]]])),
    // 計算用的暫存（clone 之間共用；JS 單執行緒，不會同時用到）
    blk: new Uint8Array(N),
    colPre: new Int32Array((H + 1) * W),
    rowPre: new Int32Array(H * (W + 1)),
    RL: new Int16Array(N), RR: new Int16Array(N), RU: new Int16Array(N), RD: new Int16Array(N),
    bCnt: new Int32Array(K), bStart: new Int32Array(K + 1), bPos: new Int32Array(K + 1), bList: new Int32Array(N),
    seg: new Int32Array(Math.max(rows, cols)),
  };

  const b = new Board();
  b._m = meta;
  b._k = kArr;
  b._id = new Int32Array(N);
  b._f = f;
  b._rs = st.rs;
  b._st = 'playing';
  b._ci = 0;                                            // cycle 關：下一次滑動用 CYCLE[_ci]
  b._diag = { shuffle: 0, jamClear: 0, giftForce: 0, moveForce: 0, stuck: 0, opening: null };

  if (!layout && slide !== 'none') b._slide(null, b.slideDir);   // 滑動關開局先擠緊（cycle 關用第一個方向 down，不換方向）
  // 開局「放一起」最多 openAdjMax 組：擠緊之後的盤面用 seeded rng 交換 kind（位置不變，所以擠緊的樣子不變）
  if (!layout && adjMax != null) b._fixOpenAdj(adjMax);
  let nextId = 1, rem = 0;
  for (let p = 0; p < N; p++) if (kArr[p] >= 0) { b._id[p] = nextId++; rem++; }
  if (rem === 0) fail('盤面上沒有任何 tile');
  b._rem = rem;

  // 點單
  if (levelDef.orders) {
    if (!Array.isArray(levelDef.orders) || levelDef.orders.length === 0) fail('orders 要是陣列');
    const have = {};
    for (let p = 0; p < N; p++) if (kArr[p] >= 0) have[kinds[kArr[p]]] = (have[kinds[kArr[p]]] || 0) + 1;
    const pairsOf = kind => {
      const i = kIndex[kind];
      if (i == null) return 0;
      if (partner[i] === i) return Math.floor((have[kind] || 0) / 2);
      if (meta.isDrink[i]) return 0;                 // D 關點單算甜點，不算飲品
      return Math.min(have[kind] || 0, have[kinds[partner[i]]] || 0);
    };
    const need = {};
    b._ord = levelDef.orders.map((items, oi) => {
      if (!Array.isArray(items) || items.length === 0) fail(`orders[${oi}] 要是 [{ kind, n }, …]`);
      return {
        items: items.map(({ kind, n }) => {
          if (!Number.isInteger(n) || n <= 0) fail(`orders[${oi}] 的 ${kind} 數量要是正整數`);
          need[kind] = (need[kind] || 0) + n;
          return { kind, need: n, got: 0 };
        }),
        done: false,
      };
    });
    for (const [kind, n] of Object.entries(need)) {
      const can = pairsOf(kind);
      if (can < n) {
        const split = kinds.filter(k => k.startsWith(kind + '@'));
        fail(`點單共要 ${n} 對 ${kind}，盤面上只有 ${can} 對${split.length ? `（${kind} 已分色，點單要寫方塊代號，例如 ${split[0]}）` : ''}`);
      }
    }
  } else b._ord = null;

  // 開局保證至少有一步（安靜處理，不產生 steps）
  if (!opts.noFix) {
    const before = { ...b._diag };
    b._resolve(null);
    const d = b._diag;
    d.opening = d.moveForce > before.moveForce ? 'move' : d.giftForce > before.giftForce ? 'giftOpen'
      : d.jamClear > before.jamClear ? 'jamClear' : d.shuffle > before.shuffle ? 'shuffle'
      : d.stuck > before.stuck ? 'stuck' : null;
  }
  if (b._diag.openAdj) b._diag.openAdj.after = b._openAdjCount();   // 真正的開局盤面（含開局保底）
  return b;
}

export default createBoard;

/**
 * v2.1 變色方塊的檢查（配對本身只看完整代號，這裡只擋關卡設計錯誤）：
 * - '甜點@顏色' 的甜點、顏色都不能是空的，顏色要在 VARIANT_BG；同一個甜點不能同時有原本的和變色的。
 * - levelDef.variants（選填，{ 甜點: [顏色, …] }）有給就要和 kinds 完全一致：
 *   列出的每個顏色 kinds 都要有 '甜點@顏色'，kinds 裡的每個變色方塊也都要列在 variants。
 * - D 關（配飲品）不分色。
 */
function checkVariants(levelDef, kinds, pairing, fail) {
  const split = {};
  for (const k of kinds) {
    if (typeof k !== 'string' || !k) fail(`kinds 的 ${JSON.stringify(k)} 不是字串`);
    const { id, variant } = splitKind(k);
    if (variant == null) continue;
    if (!id || !variant || variant.includes('@')) fail(`方塊代號 ${k} 格式錯誤（要是 '甜點@顏色'）`);
    if (!(variant in VARIANT_BG)) fail(`方塊代號 ${k} 的顏色 ${variant} 不在 VARIANT_BG`);
    (split[id] ||= []).push(variant);
  }
  for (const id of Object.keys(split)) if (kinds.includes(id)) fail(`${id} 已分色，kinds 不能再有原本的 ${id}`);
  const v = levelDef.variants;
  if (v != null) {
    if (typeof v !== 'object' || Array.isArray(v)) fail('variants 要是 { 甜點: [顏色, …] }（沒有分色＝{}）');
    for (const [id, colors] of Object.entries(v)) {
      if (!Array.isArray(colors) || colors.length < 2 || new Set(colors).size !== colors.length) fail(`variants.${id} 要是 2 種以上、不重複的顏色`);
      for (const c of colors) if (!kinds.includes(`${id}@${c}`)) fail(`variants.${id} 有 ${c}，kinds 卻沒有 ${id}@${c}`);
    }
    for (const [id, colors] of Object.entries(split)) for (const c of colors) {
      if (!Array.isArray(v[id]) || !v[id].includes(c)) fail(`kinds 的 ${id}@${c} 沒有列在 variants`);
    }
  }
  if (pairing && (Object.keys(split).length || (v && Object.keys(v).length))) fail('D 關（配飲品）不分色');
}

function seedToU32(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return Math.trunc(seed) >>> 0;
  let h = 2166136261 >>> 0;                       // 字串：FNV-1a
  for (const ch of String(seed)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
function mulberry(st) {
  let t = (st.rs = (st.rs + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ------------------------------------------------------------------ */
/* 盤面                                                                */
/* ------------------------------------------------------------------ */

class Board {
  /* ---------- 狀態（唯讀） ---------- */
  get rows() { return this._m.rows; }
  get cols() { return this._m.cols; }
  get remaining() { return this._rem; }
  get status() { return this._st; }
  get pairing() { return this._m.pairing; }
  get newKind() { return this._m.newKind; }
  get slide() { return this._m.slide; }
  /** 下一次滑動會用的方向：'down'|'up'|'left'|'right'|'center'，不是滑動關回 null（cycle 關每次配對後會變） */
  get slideDir() {
    const s = this._m.slide;
    if (s === 'none') return null;
    return s === 'cycle' ? CYCLE[this._ci] : s;
  }
  get orders() {
    return this._ord ? this._ord.map(o => ({ items: o.items.map(i => ({ kind: i.kind, need: i.need, got: i.got })), done: o.done })) : null;
  }
  pairOf(kind) {
    if (!this._m.pairing) return kind;
    const v = this._m.pairOfName[kind];
    return v === undefined ? kind : v;
  }

  cell(r, c) {
    const p = this._pAt(r, c);
    if (p < 0) return { hole: true, icing: false, jam: false, gift: false, tile: null, outside: true };
    const f = this._f[p], k = this._k[p];
    return {
      hole: !!(f & HOLE), icing: !!(f & ICING), jam: !!(f & JAM), gift: !!(f & GIFT),
      tile: k >= 0 ? this._tileObj(p) : null,
    };
  }

  tiles() {
    const m = this._m, out = [];
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
      const p = (r + 1) * m.W + c + 1, k = this._k[p];
      if (k < 0) continue;
      const t = this._tileObj(p);
      t.r = r; t.c = c; t.jam = !!(this._f[p] & JAM); t.gift = !!(this._f[p] & GIFT);
      out.push(t);
    }
    return out;
  }

  /* ---------- 動作 ---------- */
  canSelect(r, c) {
    const p = this._pAt(r, c);
    return p >= 0 && this._k[p] >= 0 && !(this._f[p] & LOCK);
  }

  tryMatch(A, B) {
    if (this._st !== 'playing') return { ok: false, reason: 'over' };
    if (!Array.isArray(A) || !Array.isArray(B)) return { ok: false, reason: 'locked' };
    if (A[0] === B[0] && A[1] === B[1]) return { ok: false, reason: 'same' };
    const p = this._pAt(A[0], A[1]), q = this._pAt(B[0], B[1]);
    const k = this._k, f = this._f, m = this._m;
    if (p < 0 || q < 0 || k[p] < 0 || k[q] < 0 || (f[p] & LOCK) || (f[q] & LOCK)) return { ok: false, reason: 'locked' };
    if (m.partner[k[p]] !== k[q]) return { ok: false, reason: 'notPair' };
    this._prefix(); this._reach(p); this._reach(q);
    const best = this._best(p, q);
    if (!best) return { ok: false, reason: 'noPath' };
    const path = best.map(x => this._rc(x));

    // ---- 成立 ----
    const steps = [];
    const id = this._id, W = m.W;
    const credit = Math.min(k[p], k[q]);          // D 關：甜點的索引一定比飲品小
    const kindName = m.kinds[credit];
    steps.push({ type: 'match', a: { r: A[0], c: A[1], id: id[p] }, b: { r: B[0], c: B[1], id: id[q] }, kind: kindName, path });
    k[p] = -1; k[q] = -1; id[p] = 0; id[q] = 0;
    this._rem -= 2;

    // 果醬：被消掉的兩格上下左右
    const melted = [];
    for (const s of [p, q]) for (const t of [s - W, s + W, s - 1, s + 1]) {
      if (f[t] & JAM) { f[t] &= ~JAM; melted.push(this._rc(t)); }
    }
    if (melted.length) steps.push({ type: 'jam', cells: melted });

    // 鑰匙 → 禮盒全開
    if (credit === m.keyK) {
      const opened = this._openGifts();
      if (opened.length) steps.push({ type: 'giftOpen', tiles: opened });
    }

    // 點單
    let won = false;
    if (this._ord) {
      const ord = this._ord;
      for (let i = 0; i < ord.length; i++) {
        const o = ord[i];
        if (o.done) continue;
        const it = o.items.find(x => x.kind === kindName && x.got < x.need);
        if (!it) continue;
        it.got++;
        o.done = o.items.every(x => x.got >= x.need);
        steps.push({ type: 'order', index: i, kind: kindName, got: it.got, need: it.need, done: o.done });
        break;
      }
      won = ord.every(o => o.done);
    }
    if (this._rem === 0) won = true;
    if (won) {
      this._st = 'won';
      steps.push({ type: 'win' });
      return { ok: true, path, steps };
    }

    // 滑動補位（cycle 關：用目前方向滑，然後換下一個方向）
    if (m.slide !== 'none') {
      const dir = this.slideDir;
      const moves = this._slide(true, dir);
      if (m.slide === 'cycle') this._ci = (this._ci + 1) % CYCLE.length;
      if (moves.length) steps.push({ type: 'slide', moves, dir });
    }
    // 卡死自動重排
    this._resolve(steps);
    return { ok: true, path, steps };
  }

  findHint() {
    if (this._st !== 'playing') return null;
    const m = this._m;
    if (this._prepSel() < 2) return null;
    let pr = null;
    if (m.keyK >= 0) pr = this._scanKinds(a => a === m.keyK);
    if (!pr && this._ord) {
      const want = new Set();
      for (const o of this._ord) if (!o.done) for (const it of o.items) if (it.got < it.need && it.kind in m.kIndex) want.add(m.kIndex[it.kind]);
      if (want.size) pr = this._scanKinds(a => want.has(a));
    }
    if (!pr) pr = this._scanKinds(null);
    if (!pr) return null;
    const best = this._best(pr[0], pr[1]);
    return { a: this._rc(pr[0]), b: this._rc(pr[1]), path: best.map(x => this._rc(x)) };
  }

  hasMove() {
    if (this._prepSel() < 2) return false;
    return this._scanKinds(null) !== null;
  }

  clone() {
    const b = new Board();
    b._m = this._m;
    b._k = this._k.slice();
    b._id = this._id.slice();
    b._f = this._f.slice();
    b._rs = this._rs;
    b._rem = this._rem;
    b._st = this._st;
    b._ci = this._ci;
    b._ord = this._ord ? this._ord.map(o => ({ items: o.items.map(i => ({ kind: i.kind, need: i.need, got: i.got })), done: o.done })) : null;
    b._diag = { ...this._diag };
    return b;
  }

  /** 測試／工具用（非正式 API）：只看幾何，兩格之間最佳路徑或 null（不管種類、果醬、禮盒） */
  _pathBetween(A, B) {
    const p = this._pAt(A[0], A[1]), q = this._pAt(B[0], B[1]);
    if (p < 0 || q < 0 || p === q) return null;
    this._prefix(); this._reach(p); this._reach(q);
    const best = this._best(p, q);
    return best ? best.map(x => this._rc(x)) : null;
  }

  /* ---------- 內部 ---------- */
  _rand() {
    let t = (this._rs = (this._rs + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  _shuffleArr(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = (this._rand() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  _pAt(r, c) {
    const m = this._m;
    if (!(r >= 0 && r < m.rows && c >= 0 && c < m.cols) || (r | 0) !== r || (c | 0) !== c) return -1;
    return (r + 1) * m.W + c + 1;
  }
  _rc(p) { const W = this._m.W, r = (p / W) | 0; return [r - 1, p - r * W - 1]; }
  _tileObj(p) {
    const m = this._m, k = this._k[p];
    return { id: this._id[p], kind: m.kinds[k], isDrink: m.isDrink[k], isKey: k === m.keyK };
  }

  /** 擋路格（有 tile 或糖霜磚）與每欄、每列的前綴和 */
  _prefix() {
    const m = this._m, W = m.W, H = m.H, k = this._k, f = this._f, blk = m.blk, cp = m.colPre, rp = m.rowPre;
    for (let x = 0; x < W; x++) cp[x] = 0;
    for (let r = 0; r < H; r++) {
      const o = r * W, ro = r * (W + 1);
      rp[ro] = 0;
      for (let x = 0; x < W; x++) {
        const p = o + x, v = (k[p] >= 0 || (f[p] & ICING)) ? 1 : 0;
        blk[p] = v;
        cp[p + W] = cp[p] + v;
        rp[ro + x + 1] = rp[ro + x] + v;
      }
    }
  }
  /** 從 p 往四個方向直走能走到的最遠位置（不含 p 自己的擋路判斷） */
  _reach(p) {
    const m = this._m, W = m.W, H = m.H, blk = m.blk;
    const r = (p / W) | 0, c = p - r * W;
    let x = c; while (x > 0 && !blk[p - (c - x) - 1]) x--; m.RL[p] = x;
    x = c; while (x < W - 1 && !blk[p + (x - c) + 1]) x++; m.RR[p] = x;
    let y = r; while (y > 0 && !blk[p - (r - y + 1) * W]) y--; m.RU[p] = y;
    y = r; while (y < H - 1 && !blk[p + (y - r + 1) * W]) y++; m.RD[p] = y;
  }
  /** p、q 能不能用最多兩個彎連起來（要先 _prefix、_reach(p)、_reach(q)） */
  _conn(p, q) {
    const m = this._m, W = m.W;
    const r1 = (p / W) | 0, c1 = p - r1 * W, r2 = (q / W) | 0, c2 = q - r2 * W;
    if (r1 !== r2) {                                       // 橫→直→橫，轉折欄 x
      const lo = Math.max(m.RL[p], m.RL[q]), hi = Math.min(m.RR[p], m.RR[q]);
      if (lo <= hi) {
        const cp = m.colPre, oa = (Math.min(r1, r2) + 1) * W, ob = Math.max(r1, r2) * W;
        for (let x = lo; x <= hi; x++) if (cp[ob + x] === cp[oa + x]) return true;
      }
    }
    if (c1 !== c2) {                                       // 直→橫→直，轉折列 y
      const lo = Math.max(m.RU[p], m.RU[q]), hi = Math.min(m.RD[p], m.RD[q]);
      if (lo <= hi) {
        const rp = m.rowPre, a = Math.min(c1, c2) + 1, b = Math.max(c1, c2);
        for (let y = lo; y <= hi; y++) { const o = y * (W + 1); if (rp[o + b] === rp[o + a]) return true; }
      }
    }
    return false;
  }
  /** 最佳路徑（彎少優先、再來路短；同分取先找到的，順序同樣品 findPath）→ padded 索引陣列或 null */
  _best(p, q) {
    const m = this._m, W = m.W;
    const r1 = (p / W) | 0, c1 = p - r1 * W, r2 = (q / W) | 0, c2 = q - r2 * W;
    let best = -1, bestScore = Infinity, bestType = 0;
    if (r1 !== r2) {
      const lo = Math.max(m.RL[p], m.RL[q]), hi = Math.min(m.RR[p], m.RR[q]);
      if (lo <= hi) {
        const cp = m.colPre, oa = (Math.min(r1, r2) + 1) * W, ob = Math.max(r1, r2) * W, dv = Math.abs(r1 - r2);
        for (let x = lo; x <= hi; x++) {
          if (cp[ob + x] !== cp[oa + x]) continue;
          const s = ((x !== c1) + (x !== c2)) * 1000 + Math.abs(c1 - x) + dv + Math.abs(x - c2);
          if (s < bestScore) { bestScore = s; best = x; bestType = 1; }
        }
      }
    }
    if (c1 !== c2) {
      const lo = Math.max(m.RU[p], m.RU[q]), hi = Math.min(m.RD[p], m.RD[q]);
      if (lo <= hi) {
        const rp = m.rowPre, a = Math.min(c1, c2) + 1, b = Math.max(c1, c2), dh = Math.abs(c1 - c2);
        for (let y = lo; y <= hi; y++) {
          const o = y * (W + 1);
          if (rp[o + b] !== rp[o + a]) continue;
          const s = ((y !== r1) + (y !== r2)) * 1000 + Math.abs(r1 - y) + dh + Math.abs(y - r2);
          if (s < bestScore) { bestScore = s; best = y; bestType = 2; }
        }
      }
    }
    if (best < 0) return null;
    const out = [p];
    if (bestType === 1) { if (best !== c1) out.push(r1 * W + best); if (best !== c2) out.push(r2 * W + best); }
    else { if (best !== r1) out.push(best * W + c1); if (best !== r2) out.push(best * W + c2); }
    out.push(q);
    return out;
  }
  /** 收集可選 tile、依種類分桶，並算好幾何；回傳可選 tile 數 */
  _prepSel() {
    const m = this._m, k = this._k, f = this._f, N = m.N, K = m.K;
    const cnt = m.bCnt, bS = m.bStart, pos = m.bPos, list = m.bList;
    cnt.fill(0);
    let n = 0;
    for (let p = 0; p < N; p++) { const kk = k[p]; if (kk >= 0 && !(f[p] & LOCK)) { cnt[kk]++; n++; } }
    let s = 0;
    for (let i = 0; i < K; i++) { bS[i] = s; pos[i] = s; s += cnt[i]; }
    bS[K] = s;
    for (let p = 0; p < N; p++) { const kk = k[p]; if (kk >= 0 && !(f[p] & LOCK)) list[pos[kk]++] = p; }
    if (n < 2) return n;
    this._prefix();
    for (let i = 0; i < n; i++) this._reach(list[i]);
    return n;
  }
  /** 找第一組能連的（accept(種類索引) 過濾；D 關的 a 一定是甜點） */
  _scanKinds(accept) {
    const m = this._m, K = m.K, bS = m.bStart, L = m.bList, part = m.partner;
    for (let a = 0; a < K; a++) {
      const b = part[a];
      if (b < a) continue;
      const a0 = bS[a], a1 = bS[a + 1];
      if (a1 - a0 === 0) continue;
      if (accept && !accept(a)) continue;
      if (a === b) {
        for (let i = a0; i < a1; i++) for (let j = i + 1; j < a1; j++) if (this._conn(L[i], L[j])) return [L[i], L[j]];
      } else {
        const b0 = bS[b], b1 = bS[b + 1];
        for (let i = a0; i < a1; i++) for (let j = b0; j < b1; j++) if (this._conn(L[i], L[j])) return [L[i], L[j]];
      }
    }
    return null;
  }
  _openGifts() {
    const m = this._m, f = this._f, out = [];
    for (let p = 0; p < m.N; p++) if (f[p] & GIFT) {
      f[p] &= ~GIFT;
      const [r, c] = this._rc(p);
      out.push({ r, c, id: this._id[p], kind: m.kinds[this._k[p]] });
    }
    return out;
  }
  /** 依方向 dir（'down'|'up'|'left'|'right'|'center'）擠緊；record=true 時回傳 moves */
  _slide(record, dir) {
    if (dir === 'center') return this._slideCenter(record);
    const m = this._m, k = this._k, id = this._id, f = this._f, W = m.W, seg = m.seg, moves = [];
    const vertical = dir === 'down' || dir === 'up';
    const lines = vertical ? m.cols : m.rows, len = vertical ? m.rows : m.cols;
    for (let L = 0; L < lines; L++) {
      let start, step;
      if (dir === 'down') { start = m.rows * W + L + 1; step = -W; }
      else if (dir === 'up') { start = W + L + 1; step = W; }
      else if (dir === 'left') { start = (L + 1) * W + 1; step = 1; }
      else { start = (L + 1) * W + m.cols; step = -1; }
      let n = 0;
      const flush = () => {
        let w = 0;
        for (let j = 0; j < n; j++) {
          const s = seg[j];
          if (k[s] < 0) continue;
          if (j !== w) {
            const d = seg[w];
            k[d] = k[s]; id[d] = id[s]; k[s] = -1; id[s] = 0;
            if (record) moves.push({ id: id[d], from: this._rc(s), to: this._rc(d) });
          }
          w++;
        }
        n = 0;
      };
      for (let i = 0; i < len; i++) {
        const p = start + i * step, fl = f[p];
        if (fl & HOLE) continue;                                   // 空洞不是位置，跳過
        if ((fl & ICING) || (k[p] >= 0 && (fl & LOCK))) { flush(); continue; }   // 固定格把一行切段
        seg[n++] = p;
      }
      flush();
    }
    return moves;
  }
  /**
   * 往中間靠攏（精確定義見 js/engine/README.md「往中間靠攏」）：
   * 每一橫列先照固定格（糖霜磚、蓋果醬的 tile、禮盒）切段、跳過 hole；每段裡
   *   左半邊（2c < cols-1）的 tile 往右擠、右半邊（2c > cols-1）的往左擠，順序不變。
   *   欄數是奇數時正中間那格（2c = cols-1，7 欄是 c=3）：上面有 tile 就不動；
   *   空著時由「這一段裡 tile 比較多的那一邊」離中間最近的那塊補進去，兩邊一樣多就空著（左右對稱）。
   */
  _slideCenter(record) {
    const m = this._m, k = this._k, id = this._id, f = this._f, W = m.W, seg = m.seg, moves = [];
    const mid2 = m.cols - 1;                       // 用兩倍座標比較，偶數欄也適用
    const move = (s, d) => {
      k[d] = k[s]; id[d] = id[s]; k[s] = -1; id[s] = 0;
      if (record) moves.push({ id: id[d], from: this._rc(s), to: this._rc(d) });
    };
    for (let r = 0; r < m.rows; r++) {
      const base = (r + 1) * W + 1;
      let n = 0;
      const flush = () => {
        if (n === 0) return;
        // a＝左半邊的位置數；hasMid＝第 a 個位置是不是正中間那格
        let a = 0;
        while (a < n && 2 * (seg[a] - base) < mid2) a++;
        const hasMid = a < n && 2 * (seg[a] - base) === mid2;
        const rs = hasMid ? a + 1 : a;              // 右半邊從第 rs 個位置開始
        let nL = 0, nR = 0;
        for (let j = 0; j < a; j++) if (k[seg[j]] >= 0) nL++;
        for (let j = rs; j < n; j++) if (k[seg[j]] >= 0) nR++;
        const midTile = hasMid && k[seg[a]] >= 0;
        let leftEnd = a, rightStart = rs;           // 左群佔 [leftEnd-nL, leftEnd)、右群佔 [rightStart, rightStart+nR)
        if (hasMid && !midTile) { if (nL > nR) leftEnd = a + 1; else if (nR > nL) rightStart = a; }
        // 左群往右：從最右邊那塊開始搬，不會蓋到還沒搬的
        for (let j = a - 1, w = leftEnd - 1; j >= 0; j--) {
          if (k[seg[j]] < 0) continue;
          if (j !== w) move(seg[j], seg[w]);
          w--;
        }
        // 右群往左：從最左邊那塊開始搬
        for (let j = rs, w = rightStart; j < n; j++) {
          if (k[seg[j]] < 0) continue;
          if (j !== w) move(seg[j], seg[w]);
          w++;
        }
        n = 0;
      };
      for (let c = 0; c < m.cols; c++) {
        const p = base + c, fl = f[p];
        if (fl & HOLE) continue;                                   // 空洞不是位置，跳過
        if ((fl & ICING) || (k[p] >= 0 && (fl & LOCK))) { flush(); continue; }   // 固定格把一列切段
        seg[n++] = p;
      }
      flush();
    }
    return moves;
  }

  /**
   * 卡死處理：重排 → 果醬全融再重排（以上是 架構.md 的規則）
   * → （保底）搬一塊 tile 到連得到的最近空格 → （保底）禮盒全開。
   * 保底是為了「最後幾塊被糖霜磚卡成要三個彎」這種重排救不了的情況。
   */
  _resolve(steps) {
    if (this._st !== 'playing' || this._rem === 0) return;
    if (this.hasMove()) return;
    const push = steps ? e => steps.push(e) : () => {};
    const d = this._diag, m = this._m, f = this._f;
    if (this._shuffle(push)) return;
    const jam = [];
    for (let p = 0; p < m.N; p++) if (f[p] & JAM) { f[p] &= ~JAM; jam.push(this._rc(p)); }
    if (jam.length) {
      d.jamClear++;
      push({ type: 'jamClear', cells: jam });
      if (this.hasMove() || this._shuffle(push)) return;
    }
    if (this._forceMove(push)) { d.moveForce++; return; }
    const opened = this._openGifts();
    if (opened.length) {
      d.giftForce++;
      push({ type: 'giftOpen', tiles: opened });
      if (this.hasMove() || this._shuffle(push)) return;
      if (this._forceMove(push)) { d.moveForce++; return; }
    }
    d.stuck++;
  }
  /** 可移動 tile 的 kind 互相洗牌（位置與 id 不動），直到有步；做不到回 false 且不改狀態 */
  _shuffle(push) {
    const m = this._m, k = this._k, part = m.partner;
    const n = this._prepSel();
    if (n < 2) return false;
    const mv = [];
    for (let p = 0; p < m.N; p++) if (k[p] >= 0 && !(this._f[p] & LOCK)) mv.push(p);
    const pairs = [];                                     // 幾何上連得到的位置組（和 kind 無關）
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (this._conn(mv[i], mv[j])) pairs.push(i, j);
    if (!pairs.length) return false;
    const arr = mv.map(p => k[p]);
    const cnt = new Int32Array(m.K);
    for (const v of arr) cnt[v]++;
    let u = -1, v = -1;                                   // 有沒有任何一對配得起來
    for (let i = 0; i < n && u < 0; i++) for (let j = i + 1; j < n; j++) if (part[arr[i]] === arr[j]) { u = i; v = j; break; }
    if (u < 0) return false;
    const good = () => { for (let t = 0; t < pairs.length; t += 2) if (part[arr[pairs[t]]] === arr[pairs[t + 1]]) return true; return false; };
    let ok = false;
    for (let t = 0; t < SHUFFLE_TRIES && !ok; t++) { this._shuffleArr(arr); ok = good(); }
    if (!ok) {
      // 保底：直接把一對配得起來的 kind 放到一組連得到的位置
      u = -1;
      for (let i = 0; i < n && u < 0; i++) for (let j = i + 1; j < n; j++) if (part[arr[i]] === arr[j]) { u = i; v = j; break; }
      const t = ((this._rand() * (pairs.length / 2)) | 0) * 2;
      const pi = pairs[t], pj = pairs[t + 1], X = arr[u], Y = arr[v];
      const rest = arr.filter((_, i) => i !== u && i !== v);
      let it = 0;
      for (let i = 0; i < n; i++) arr[i] = i === pi ? X : i === pj ? Y : rest[it++];
    }
    for (let i = 0; i < n; i++) k[mv[i]] = arr[i];
    this._diag.shuffle++;
    push({ type: 'shuffle', tiles: mv.map((p, i) => { const [r, c] = this._rc(p); return { id: this._id[p], r, c, kind: m.kinds[arr[i]] }; }) });
    return true;
  }
  /** 最後保底（幾乎不會發生，例如糖霜磚把剩下的 tile 隔開）：把 tile 搬到連得到的空格，用 slide 事件通知畫面 */
  _forceMove(push) {
    const m = this._m, k = this._k, id = this._id, f = this._f, part = m.partner;
    const tiles = [], empties = [];
    for (let p = 0; p < m.N; p++) {
      if (k[p] >= 0) { if (!(f[p] & LOCK)) tiles.push(p); }
      else if (this._isPlaceable(p)) empties.push(p);
    }
    const move = (from, to) => {
      k[to] = k[from]; id[to] = id[from]; k[from] = -1; id[from] = 0;
      return { id: id[to], from: this._rc(from), to: this._rc(to) };
    };
    // A：把一塊搬到「和它的夥伴連得到」的空格，挑搬最近的
    const W = m.W;
    const dist = (a, b) => { const ra = (a / W) | 0, rb = (b / W) | 0; return Math.abs(ra - rb) + Math.abs((a - ra * W) - (b - rb * W)); };
    let bu = -1, be = -1, bd = Infinity;
    for (const vq of tiles) for (const up of tiles) {
      if (up === vq || part[k[up]] !== k[vq]) continue;
      const ku = k[up]; k[up] = -1;
      this._prefix(); this._reach(vq);
      for (const e of empties) {
        const dd = dist(up, e);
        if (dd >= bd) continue;
        this._reach(e);
        if (this._conn(e, vq)) { bd = dd; bu = up; be = e; }
      }
      k[up] = ku;
    }
    if (bu >= 0) { push({ type: 'slide', moves: [move(bu, be)], dir: 'rescue' }); return true; }
    // B：兩塊都搬到一組連得到的空格
    for (const vq of tiles) for (const up of tiles) {
      if (up === vq || part[k[up]] !== k[vq]) continue;
      const ku = k[up], kv = k[vq]; k[up] = -1; k[vq] = -1;
      const cand = empties.concat([up, vq]);
      this._prefix();
      for (const e of cand) this._reach(e);
      let e1 = -1, e2 = -1;
      for (let i = 0; i < cand.length && e1 < 0; i++) for (let j = i + 1; j < cand.length; j++) if (this._conn(cand[i], cand[j])) { e1 = cand[i]; e2 = cand[j]; break; }
      k[up] = ku; k[vq] = kv;
      if (e1 >= 0) {
        const moves = [];
        // 先搬到不衝突的位置
        if (e1 === vq || e2 === up) { const t = e1; e1 = e2; e2 = t; }
        if (e1 !== up) moves.push(move(up, e1));
        if (e2 !== vq) moves.push(move(vq, e2));
        push({ type: 'slide', moves, dir: 'rescue' });
        return true;
      }
      return false;   // 連任何兩個空格都連不到：盤面設計本身有問題
    }
    return false;
  }
  /**
   * 開局「放一起」的鄰居（只看位置，不看種類）：每塊 tile 往右、往下找第一個不是 hole、也不是空格的格子，
   * 那格有 tile 就是鄰居；碰到糖霜磚或盤面邊界就沒有。也就是「上下左右緊貼，或同一列／同一行中間只隔著 hole」。
   * 禮盒裡的、蓋果醬的 tile 也算；對角不算。回傳扁平陣列 [p0, q0, p1, q1, …]。
   */
  _adjNeighbors() {
    const m = this._m, k = this._k, f = this._f, W = m.W, out = [];
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
      const p = (r + 1) * W + c + 1;
      if (k[p] < 0) continue;
      for (let dir = 0; dir < 2; dir++) {
        const step = dir === 0 ? 1 : W, lim = dir === 0 ? m.cols - 1 - c : m.rows - 1 - r;
        let q = p, hit = false;
        for (let i = 0; i < lim; i++) {
          q += step;
          if (f[q] & ICING) break;
          if (k[q] >= 0) { hit = true; break; }
        }
        if (hit) out.push(p, q);
      }
    }
    return out;
  }
  /** 目前盤面「放一起」而且是可配的一對（同代號；D 關＝甜點和它的飲品；鑰匙＝兩把鑰匙）有幾組（測試／診斷用） */
  _openAdjCount() {
    const E = this._adjNeighbors(), k = this._k, part = this._m.partner;
    let n = 0;
    for (let i = 0; i < E.length; i += 2) if (part[k[E[i]]] === k[E[i + 1]]) n++;
    return n;
  }
  /**
   * 開局修正：把「放一起」的組數降到 max 以下，而且保證至少有一步可走。
   * 做法（min-conflicts）：隨機挑一組放一起的，把其中一格的 kind 和隨機另一格交換，放一起的組數變少才接受
   * （一樣多時偶爾也接受，免得卡在原地）。組數夠少但沒有步 → 隨機換一組再繼續。只交換 kind，位置、數量不變；
   * 鑰匙不換進果醬或禮盒。全部用 board 的 seeded rng，同 seed 同盤。最多 ADJ_ITERS 輪，做不到就停（之後的開局保底會確保有步）。
   * 結果寫在 _diag.openAdj = { max, before, after, swaps, ok }（after 在 createBoard 最後重算）。
   */
  _fixOpenAdj(max) {
    const m = this._m, k = this._k, f = this._f, part = m.partner, keyK = m.keyK;
    const E = this._adjNeighbors();
    const nbs = new Map();
    for (let i = 0; i < E.length; i += 2) {
      const a = E[i], b = E[i + 1];
      if (!nbs.has(a)) nbs.set(a, []); if (!nbs.has(b)) nbs.set(b, []);
      nbs.get(a).push(b); nbs.get(b).push(a);
    }
    const NONE = [];
    const occ = [];
    for (let p = 0; p < m.N; p++) if (k[p] >= 0) occ.push(p);
    const isPair = (a, b) => part[k[a]] === k[b];
    const local = (a, b) => {                       // 和 a 或 b 有關的「放一起」組數（a-b 那條只算一次）
      let s = 0;
      for (const q of nbs.get(a) || NONE) if (isPair(a, q)) s++;
      for (const q of nbs.get(b) || NONE) if (q !== a && isPair(b, q)) s++;
      return s;
    };
    const canSwap = (a, b) => a !== b && k[a] !== k[b] && !(k[a] === keyK && (f[b] & LOCK)) && !(k[b] === keyK && (f[a] & LOCK));
    const swap = (a, b) => { const t = k[a]; k[a] = k[b]; k[b] = t; };
    let cur = 0;
    for (let i = 0; i < E.length; i += 2) if (isPair(E[i], E[i + 1])) cur++;
    const d = { max, before: cur, after: cur, swaps: 0, ok: false };
    this._diag.openAdj = d;
    if (occ.length < 2) { d.ok = cur <= max; return; }
    const bad = [];
    for (let it = 0; it < ADJ_ITERS; it++) {
      if (cur <= max) {
        if (this.hasMove()) { d.ok = true; break; }
        const a = occ[(this._rand() * occ.length) | 0], b = occ[(this._rand() * occ.length) | 0];
        if (canSwap(a, b)) { const s0 = local(a, b); swap(a, b); cur += local(a, b) - s0; d.swaps++; }
        continue;
      }
      bad.length = 0;
      for (let i = 0; i < E.length; i += 2) if (isPair(E[i], E[i + 1])) bad.push(i);
      const e = bad[(this._rand() * bad.length) | 0];
      const a = E[e + (this._rand() < 0.5 ? 0 : 1)];
      for (let t = 0; t < 24; t++) {
        const b = occ[(this._rand() * occ.length) | 0];
        if (!canSwap(a, b)) continue;
        const s0 = local(a, b);
        swap(a, b);
        const s1 = local(a, b);
        if (s1 < s0 || (s1 === s0 && this._rand() < 0.2)) { cur += s1 - s0; d.swaps++; break; }
        swap(a, b);
      }
    }
    d.after = cur;
  }
  _isPlaceable(p) {
    const m = this._m, W = m.W, r = (p / W) | 0, c = p - r * W;
    return r >= 1 && r <= m.rows && c >= 1 && c <= m.cols && !(this._f[p] & SOLID);
  }
}
