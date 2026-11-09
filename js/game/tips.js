// 第一次出現新機制時的教學（關卡前卡片裡顯示）：標題、說明、用真的方塊畫的小示意圖。
import { miniTile, kindLabel } from './tileArt.js';
import { splitKind, VARIANT_TRIOS } from '../config.js';
import { drawCream, trimEnds } from './cream.js';
import { DESSERT_BY_ID, DRINK_BY_ID } from '../data/desserts.js';
import { timerBarHTML, fmtTime, PENALTY_SEC } from './timer.js';
import { ICON_CYCLE } from './icons.js';

export const TIPS = {
  basic: { title: '怎麼玩', text: '點兩個一樣的甜點，用奶油線連起來就會被吃掉！線最多轉兩個彎、不能穿過別的甜點，但可以繞到盤子外面。全部吃光就過關，不計時，慢慢玩～',
    // v2「中」限時關用這句（不能說不計時）
    textTimed: '點兩個一樣的甜點，用奶油線連起來就會被吃掉！線最多轉兩個彎、不能穿過別的甜點，但可以繞到盤子外面。全部吃光就過關！' },
  shape: { title: '造型盤子', text: '這次的盤子有造型！挖空的地方沒有甜點，奶油線可以直接穿過去。' },
  slide: { title: '滑動補位', text: '吃掉甜點後，其他甜點會往箭頭方向滑過去補位，盤面會一直變化喔。' },
  icing: { title: '糖霜磚', text: '白白的糖霜磚吃不掉、也推不動，奶油線要繞過它。' },
  jam: { title: '果醬', text: '蓋著果醬的甜點被黏住了，暫時不能選。在它旁邊（上下左右）吃掉一組，果醬就會融化。' },
  gift: { title: '上鎖禮盒', text: '盤子上有兩塊鑰匙餅乾，把它們連起來，所有禮盒就會打開，裡面藏著甜點！' },
  order: { title: '客人點單', text: '上面是客人的點單，照著點單把甜點吃掉；點單全部完成就過關，不用全部吃光。' },
  pairing: { title: '甜點配飲品', text: '今天的規則不一樣：甜點要和它的招牌飲品配成一對！忘記了隨時按「菜單」看。' },
  // v2「中」的兩種新滑動
  center: { title: '往中間補位', text: '吃掉甜點後，左半邊的甜點往右靠、右半邊的往左靠，大家都往盤子正中間擠過去。' },
  cycle: { title: '輪流換方向', text: '每吃掉一組，補位方向就換一次：往下 → 往左 → 往上 → 往右，然後再從頭輪。盤子上的小標籤會告訴你下一次往哪邊。' },
};

const DIR = { down: [1, 0], up: [-1, 0], left: [0, -1], right: [0, 1] };
const ARROW = { down: '↓', up: '↑', left: '←', right: '→' };

/**
 * 小盤面：grid 每個字元一格（'.' 空格、'#' 空洞、'I' 糖霜磚、'G' 禮盒、'K' 鑰匙，其他字母查 legend）；
 * 小寫字母＝蓋果醬。path：奶油線（格子座標，可以用 -1 走外圍）。arrows：[{ at:[r,c], dir }]。glow：[[r,c]]。
 */
function scene({ grid, legend = {}, path = null, arrows = [], glow = [], size = 34 }) {
  const gap = 3, pad = 12;
  const rows = grid.length, cols = grid[0].length;
  const w = cols * size + (cols - 1) * gap + pad * 2, h = rows * size + (rows - 1) * gap + pad * 2;
  const box = document.createElement('div');
  box.className = 'g-scene';
  box.style.width = w + 'px'; box.style.height = h + 'px';
  const xy = (r, c) => [pad + c * (size + gap) + size / 2, pad + r * (size + gap) + size / 2];
  const lane = pad * 0.55;
  const pxy = (r, c) => {
    const [x, y] = xy(Math.max(0, Math.min(rows - 1, r)), Math.max(0, Math.min(cols - 1, c)));
    return [c < 0 ? pad - lane : c >= cols ? w - pad + lane : x, r < 0 ? pad - lane : r >= rows ? h - pad + lane : y];
  };
  grid.forEach((line, r) => [...line].forEach((ch, c) => {
    if (ch === '#') return;
    const [x, y] = xy(r, c);
    const slot = document.createElement('span');
    slot.className = 'g-scene-slot';
    Object.assign(slot.style, { left: x - size / 2 + 'px', top: y - size / 2 + 'px', width: size + 'px', height: size + 'px' });
    box.appendChild(slot);
    if (ch === '.') return;
    const lower = ch >= 'a' && ch <= 'z';
    const kind = ch === 'I' ? 'icing' : ch === 'G' ? 'gift' : ch === 'K' ? 'key' : legend[ch.toUpperCase()];
    const t = miniTile(kind, size, { jam: lower });
    Object.assign(t.style, { position: 'absolute', left: x - size / 2 + 'px', top: y - size / 2 + 'px' });
    if (glow.some(([gr, gc]) => gr === r && gc === c)) t.classList.add('g-glow');
    box.appendChild(t);
  }));
  if (path || arrows.length) {
    const cv = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    cv.className = 'g-scene-cv';
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    if (path) drawCream(ctx, trimEnds(path.map(([r, c]) => pxy(r, c)), size * 0.38), 1, 1, Math.max(6, size * 0.24), false);
    box.appendChild(cv);
    for (const a of arrows) {
      const [x, y] = xy(a.at[0], a.at[1]);
      const s = document.createElement('span');
      s.className = 'g-scene-arrow'; s.textContent = ARROW[a.dir];
      const [dr, dc] = DIR[a.dir];
      Object.assign(s.style, { left: x + dc * (size / 2 + gap / 2) + 'px', top: y + dr * (size / 2 + gap / 2) + 'px' });
      box.appendChild(s);
    }
  }
  return box;
}

function pairRow(...els) {
  const row = document.createElement('div');
  row.className = 'g-scene-row';
  els.forEach(e => row.appendChild(typeof e === 'string' ? Object.assign(document.createElement('span'), { className: 'g-scene-to', textContent: e }) : e));
  return row;
}
/** 上下排（橫的一整列太寬，左右放不下時用） */
function stackCol(...els) {
  const col = pairRow(...els);
  col.className = 'g-scene-col';
  return col;
}

/** 依關卡產生示意圖（用這關的甜點，玩家一看就懂） */
export function tipScene(key, lv) {
  // 不用本關的新甜點畫示意圖（關卡前它還是剪影，不要先爆雷）。
  // v2.1：同一個甜點的 3 色只取一個（示意圖裡「不同的甜點」要真的不同，才不會跟同色規則搞混）
  const seen = new Set();
  const pool = (lv.kinds || []).filter(x => {
    const id = splitKind(x).id;
    if (id === lv.newDessert || seen.has(id)) return false;
    seen.add(id); return true;
  });
  const k = pool.length >= 2 ? pool : ['croissant', 'macaron', 'eggtart', 'donut'];
  const L = { A: k[0], B: k[1 % k.length], C: k[2 % k.length], D: k[3 % k.length] };
  switch (key) {
    case 'basic': return scene({ grid: ['A...', 'BCDA'], legend: L, path: [[0, 0], [0, 3], [1, 3]] });
    case 'shape': return scene({ grid: ['A##A', 'BCDB'], legend: L, path: [[0, 0], [0, 3]] });
    case 'icing': return scene({ grid: ['...', 'AIA', 'BCB'], legend: L, path: [[1, 0], [0, 0], [0, 2], [1, 2]] });
    case 'jam': return pairRow(scene({ grid: ['AAb'], legend: L, path: [[0, 0], [0, 1]] }), '→', scene({ grid: ['..B'], legend: L, glow: [[0, 2]] }));
    case 'gift': return pairRow(scene({ grid: ['...', 'KGK'], legend: L, path: [[1, 0], [0, 0], [0, 2], [1, 2]] }), '→', scene({ grid: ['...', '.C.'], legend: L, glow: [[1, 1]] }));
    case 'slide': {
      const dir = lv.slide && DIR[lv.slide] ? lv.slide : 'down';
      const [dr, dc] = DIR[dir];
      const before = [['C', 'B', 'D'], ['B', '.', 'C'], ['D', 'C', 'B']];
      const after = before.map(r => r.slice());
      const from = [1 - dr, 1 - dc];
      before[from[0]][from[1]] = 'A';
      after[from[0]][from[1]] = '.'; after[1][1] = 'A';
      return pairRow(scene({ grid: before.map(r => r.join('')), legend: L, arrows: [{ at: from, dir }] }), '→',
        scene({ grid: after.map(r => r.join('')), legend: L, glow: [[1, 1]] }));
    }
    case 'center': {
      // 跟真的盤子一樣 7 格一列：左半邊往右、右半邊往左，擠到正中間（淡粉紅虛線框＝正中間那格）
      // 例子照引擎的定義（js/engine/README.md）：AB...C. → ..ABC..（左邊比較多，B 補進正中間）
      const mid = sc => { sc.classList.add('g-scene-mid'); sc.style.setProperty('--s', '30px'); return sc; };
      return stackCol(
        mid(scene({ grid: ['AB...C.'], legend: L, size: 30, arrows: [{ at: [0, 1], dir: 'right' }, { at: [0, 5], dir: 'left' }] })),
        '↓',
        mid(scene({ grid: ['..ABC..'], legend: L, size: 30, glow: [[0, 2], [0, 3], [0, 4]] })));
    }
    case 'cycle': {
      // 方向順序：↓ ← ↑ →，再從頭輪
      const row = document.createElement('div');
      row.className = 'g-cycle';
      ['down', 'left', 'up', 'right'].forEach((d, i) => {
        if (i) row.insertAdjacentHTML('beforeend', '<span class="g-cycle-to">›</span>');
        row.insertAdjacentHTML('beforeend', `<span class="g-cycle-step"><b>${ARROW[d]}</b><small>第 ${i + 1} 次</small></span>`);
      });
      row.insertAdjacentHTML('beforeend', `<span class="g-cycle-to">›</span><span class="g-cycle-step g-cycle-again"><b>${ICON_CYCLE}</b><small>再輪</small></span>`);
      return row;
    }
    case 'pairing': {
      const d = DESSERT_BY_ID[k[0]];
      L.B = d ? d.drink : k[0];
      return scene({ grid: ['A.B'], legend: L, path: [[0, 0], [0, 2]], size: 40 });
    }
    case 'order': {
      const t = document.createElement('div'); t.className = 'g-scene-order';
      t.appendChild(miniTile(k[0], 30)); t.insertAdjacentHTML('beforeend', '<b>×2</b>');
      t.appendChild(miniTile(k[1 % k.length], 30)); t.insertAdjacentHTML('beforeend', '<b>×1</b>');
      return t;
    }
    default: return null;
  }
}

/** 教學區塊：標題＋小圖＋說明 */
export function tipBlock(key, lv) {
  const tip = TIPS[key]; if (!tip) return null;
  const el = document.createElement('section');
  el.className = 'g-tip';
  el.innerHTML = `<h3><span>${key === 'basic' ? '玩法' : '新玩法'}</span>${tip.title}</h3>`;
  const sc = tipScene(key, lv);
  if (sc) { const w = document.createElement('div'); w.className = 'g-tip-pic'; w.appendChild(sc); el.appendChild(w); }
  const p = document.createElement('p'); p.textContent = (lv && lv.timeLimit && tip.textTimed) || tip.text; el.appendChild(p);
  return el;
}

/** v2.1：同色規則示意用的甜點與兩種顏色（優先用這關真的有分色、而且不是新甜點的那個） */
function variantSample(lv) {
  const vars = { ...(lv && lv.variants) };
  for (const k of (lv && lv.kinds) || []) {
    const { id, variant } = splitKind(k);
    if (!variant) continue;
    const list = [...(vars[id] || [])];
    if (!list.includes(variant)) list.push(variant);
    vars[id] = list;
  }
  const id = Object.keys(vars).find(x => x !== lv?.newDessert && vars[x].length >= 2);
  if (id) return { id, a: vars[id][0], b: vars[id][1] };
  return { id: 'donut', a: VARIANT_TRIOS[0][0], b: VARIANT_TRIOS[0][1] };   // 甜甜圈是開店禮，一定看過
}

/**
 * v2「中」第一次玩限時關：挑戰模式規則（關卡前卡片最上面，金色系，跟關卡本身的教學分開）。
 * v2.1 多兩點：同一種甜點底色也要一樣才能配（藍✔藍、藍✘粉）、配錯扣 5 秒＋怎麼取消選取。
 */
export function timerTipBlock(limitSec, lv) {
  const el = document.createElement('section');
  el.className = 'g-tip g-tip-timer';
  el.innerHTML = '<h3><span>挑戰模式</span>規則</h3>' +
    `<div class="g-tip-pic"><div class="g-tmock"><span class="g-clockico" aria-hidden="true"></span><div class="g-timer">${timerBarHTML(0.72, fmtTime(limitSec * 1000 * 0.72))}</div></div></div>` +
    '<p>時間到要重來；剩越多時間，星星越多。剩不到三成（<b class="g-tstar">★</b>）或用了提示，各少一顆星。</p>';

  // 1. 同色才能配：藍底甜甜圈 ✔ 藍底甜甜圈；藍底 ✘ 粉底
  const { id, a, b } = variantSample(lv);
  const A = `${id}@${a}`, B = `${id}@${b}`;
  const r1 = document.createElement('div'); r1.className = 'g-rule';
  const pic1 = document.createElement('div'); pic1.className = 'g-rule-pic g-rule-pairs';
  const pair = (x, y, ok) => {
    const line = document.createElement('span');
    line.className = 'g-rule-pair ' + (ok ? 'g-ok' : 'g-no');
    line.setAttribute('aria-label', `${kindLabel(x)}${ok ? '可以配' : '不能配'}${kindLabel(y)}`);
    line.appendChild(miniTile(x, 28));
    line.insertAdjacentHTML('beforeend', `<i aria-hidden="true">${ok ? '✔' : '✘'}</i>`);
    line.appendChild(miniTile(y, 28));
    return line;
  };
  pic1.appendChild(pair(A, A, true));
  pic1.appendChild(pair(A, B, false));
  r1.appendChild(pic1);
  r1.insertAdjacentHTML('beforeend', '<p>同一種甜點，<b>底色也要一樣</b>才能配。</p>');
  el.appendChild(r1);

  // 2. 配錯扣 5 秒：倒數條右端紅一段＋「−5」
  const r2 = document.createElement('div'); r2.className = 'g-rule';
  r2.innerHTML = `<div class="g-rule-pic"><div class="g-tmock g-tmock-mini"><div class="g-timer">${timerBarHTML(0.5, '')}</div>` +
    `<b class="g-rule-minus">−${PENALTY_SEC}</b></div></div>` +
    `<p><b>配錯扣 ${PENALTY_SEC} 秒</b>；想換選擇，先點一下原本選的取消。</p>`;
  const bar = r2.querySelector('.g-tbar');
  const seg = document.createElement('b'); seg.className = 'g-tdmg g-tdmg-still'; seg.style.width = '72%';
  bar.insertBefore(seg, bar.querySelector('i'));
  bar.querySelector('.g-tmark')?.remove();
  r2.querySelector('.g-ttime')?.remove();
  el.appendChild(r2);
  return el;
}

/** D 關今日菜單：甜點 → 飲品 */
export function menuList(kinds) {
  const ul = document.createElement('ul');
  ul.className = 'g-menu';
  for (const id of kinds) {
    const d = DESSERT_BY_ID[id]; if (!d) continue;
    const li = document.createElement('li');
    li.appendChild(miniTile(id, 36));
    li.insertAdjacentHTML('beforeend', `<span class="g-menu-name">${d.name}</span><span class="g-menu-dots"></span>`);
    li.appendChild(miniTile(d.drink, 36));
    li.insertAdjacentHTML('beforeend', `<span class="g-menu-name g-menu-drink">${DRINK_BY_ID[d.drink]?.name || d.drink}</span>`);
    ul.appendChild(li);
  }
  return ul;
}
