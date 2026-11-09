// 關卡畫面上的浮層：關卡前卡片、暫停、今日菜單、過關、新甜點解鎖卡。
import { Art } from '../art/common.js';
import { TILE_BG, REGION_BY_ID, splitKind } from '../config.js';
import { DESSERT_BY_ID } from '../data/desserts.js';
import { tipBlock, timerTipBlock, menuList } from './tips.js';
import { miniTile } from './tileArt.js';
import { fmtTime } from './timer.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/** 一層浮層＋卡片 */
export function overlay(host, cls = '') {
  const el = document.createElement('div');
  el.className = 'g-ov ' + cls;
  const card = document.createElement('div');
  card.className = 'card g-card';
  el.appendChild(card);
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('g-show'));
  return {
    el, card,
    close() { el.classList.remove('g-show'); el.classList.add('g-hide'); setTimeout(() => el.remove(), 220); },
  };
}

function btn(text, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

/** 這關有沒有變色方塊（v2.1「中」） */
export const hasVariants = lv => (lv.kinds || []).some(k => splitKind(k).variant) || Object.keys(lv.variants || {}).length > 0;

/**
 * 關卡前「今天的盤子」：這關的每一種方塊各一個小圖。
 * v2.1：變色方塊（'donut@blue'…）把同一個甜點的 3 種底色排在一起、用一個小框框住；
 * kinds 裡如果只寫了甜點代號、但 variants 有它，也照 variants 畫出 3 色。沒有分色的關跟 v2.0 一模一樣。
 */
export function kindsRow(lv, newDessert, size = 30) {
  const row = document.createElement('div'); row.className = 'g-kinds';
  const variants = lv.variants || {};
  const groups = new Map();
  const group = id => {
    let g = groups.get(id);
    if (!g) {
      g = document.createElement('span'); g.className = 'g-kgroup';
      g.setAttribute('role', 'group');
      g.setAttribute('aria-label', `${DESSERT_BY_ID[id]?.name || id}（3 種底色）`);
      groups.set(id, g); row.appendChild(g);
    }
    return g;
  };
  for (const k of lv.kinds || []) {
    const { id, variant } = splitKind(k);
    const sil = newDessert === id;   // 新甜點還是剪影（變色的也一樣，不先爆雷）
    if (variant) { group(id).appendChild(miniTile(k, size, { silhouette: sil })); continue; }
    if (Array.isArray(variants[id]) && variants[id].length) {
      const g = group(id);
      for (const v of variants[id]) g.appendChild(miniTile(`${id}@${v}`, size, { silhouette: sil }));
      continue;
    }
    row.appendChild(miniTile(k, size, { silhouette: newDessert === k }));
  }
  if (groups.size) row.classList.add('g-kinds-v');
  return row;
}

/** 關卡前：地區、第幾關、新甜點剪影、教學、今日菜單、開始。
 *  v2：mode＝難度名稱（中），timer＝{ limit 秒, explain 第一次的計時說明 }（限時關才有） */
export function showIntro(host, { lv, region, title, mode, newDessert, tips, timer, menuKinds, onStart, sfx }) {
  const ov = overlay(host, 'g-intro' + (timer ? ' g-timedintro' : ''));
  const c = ov.card;
  c.innerHTML = `<div class="g-ribbon">${esc(region.flag)} ${mode ? `<span class="g-rmode">${esc(mode)}</span>・` : ''}${esc(region.name)}</div><h2 class="g-lvtitle">${esc(title)}</h2>` +
    (lv.shapeName || timer ? '<div class="g-pills">' +
      (lv.shapeName ? `<div class="g-shape">今天的盤子：<b>${esc(lv.shapeName)}</b></div>` : '') +
      (timer ? `<div class="g-limit"><span class="g-clockico" aria-hidden="true"></span>限時 <b>${fmtTime(timer.limit * 1000)}</b></div>` : '') +
      '</div>' : '');
  // 這關的甜點（「今天的盤子」）。v2.1：分色的關方塊比較多，小圖縮成 26 px（沒分色的關照舊 30 px）
  const variantLv = hasVariants(lv);
  c.appendChild(kindsRow(lv, newDessert, variantLv && (lv.kinds || []).length > 9 ? 26 : 30));
  if (variantLv) {
    // v2.1「中」：有分色的關，每次都提醒一句（框起來的是同一種甜點的 3 種底色）
    c.insertAdjacentHTML('beforeend', '<p class="g-kvnote">框起來的是同一種甜點的 3 種底色，<b>同色</b>才能配</p>');
  }
  if (newDessert) {
    const nd = document.createElement('div'); nd.className = 'g-newd';
    nd.innerHTML = '<div class="g-newd-pic"><canvas></canvas><i>?</i></div><div><b>這關有新甜點登場！</b><span>過關就能收進圖鑑</span></div>';
    const cv = nd.querySelector('canvas');
    c.appendChild(nd);
    Art.renderSilhouette(cv, newDessert, 92, { doily: true });
  }
  if (timer && timer.explain) c.appendChild(timerTipBlock(timer.limit, lv));
  for (const key of tips) { const t = tipBlock(key, lv); if (t) c.appendChild(t); }
  if (menuKinds) {
    const m = document.createElement('section'); m.className = 'g-menubox';
    m.innerHTML = '<h3>今日菜單</h3>';
    m.appendChild(menuList(menuKinds));
    c.appendChild(m);
  }
  const go = btn('開始', 'g-start', () => { sfx('tap'); ov.close(); onStart(); });
  const foot = document.createElement('div'); foot.className = 'g-ov-foot'; foot.appendChild(go);
  c.appendChild(foot);
  return ov;
}

/** D 關遊戲中再打開的菜單 */
export function showMenu(host, kinds, onClose, sfx) {
  const ov = overlay(host, 'g-menuov');
  ov.card.innerHTML = '<h2 class="g-ovtitle">今日菜單</h2><p class="g-ovsub">甜點要配它的招牌飲品</p>';
  ov.card.appendChild(menuList(kinds));
  const foot = document.createElement('div'); foot.className = 'g-ov-foot';
  foot.appendChild(btn('知道了', '', () => { sfx('tap'); ov.close(); onClose(); }));
  ov.card.appendChild(foot);
  ov.el.addEventListener('click', e => { if (e.target === ov.el) { sfx('tap'); ov.close(); onClose(); } });
  return ov;
}

/** 暫停：繼續、重玩、回地圖、音效音樂開關 */
export function showPause(host, { settings, onResume, onRestart, onMap, onSetting, sfx, timed }) {
  const ov = overlay(host, 'g-pauseov');
  const c = ov.card;
  c.innerHTML = `<h2 class="g-ovtitle">休息一下</h2><p class="g-ovsub">${timed ? '計時暫停中，準備好再繼續' : '不計時，想玩再回來就好'}</p>` +
    // v2.1「中」：提醒配錯扣秒、怎麼取消選取
    (timed ? '<p class="g-pausenote"><b>配錯扣 5 秒</b>：想換選擇，先點一下原本選的取消</p>' : '');
  const list = document.createElement('div'); list.className = 'g-pause-btns';
  list.appendChild(btn('繼續', '', () => { sfx('tap'); ov.close(); onResume(); }));
  list.appendChild(btn('重玩這一關', 'ghost', () => { sfx('tap'); onRestart(); }));
  list.appendChild(btn('回地圖', 'ghost', () => { sfx('tap'); onMap(); }));
  c.appendChild(list);
  const sw = document.createElement('div'); sw.className = 'g-switches';
  for (const [key, label] of [['sfx', '音效'], ['music', '音樂']]) {
    const line = document.createElement('div'); line.className = 'g-switch';
    line.innerHTML = `<span>${label}</span><span class="seg"><button type="button" data-v="1">開</button><button type="button" data-v="0">關</button></span>`;
    const seg = line.querySelector('.seg');
    const paint = on => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.v === '1') === on));
    paint(!!settings[key]);
    seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const on = b.dataset.v === '1'; paint(on); onSetting(key, on); sfx('tap');
    });
    sw.appendChild(line);
  }
  c.appendChild(sw);
  ov.el.addEventListener('click', e => { if (e.target === ov.el) { sfx('tap'); ov.close(); onResume(); } });
  return ov;
}

/** 過關卡：標題、星星逐顆亮起；之後由 gameScreen 決定接解鎖卡或按鈕 */
export function showWin(host, { title, sub, time, miss = 0, penaltySec = 5 }) {
  const ov = overlay(host, 'g-winov');
  ov.card.innerHTML = `<div class="g-win-h"><h2 class="g-wintitle">${esc(title)}</h2>
    <div class="g-winstars"><i>★</i><i>★</i><i>★</i></div>` +
    (time ? `<div class="g-wintime"><span class="g-clockico" aria-hidden="true"></span>${esc(time)}` +
      // v2.1「中」：配錯幾次（扣了幾秒）
      (miss > 0 ? `<span class="g-winmiss">配錯 ${Number(miss)} 次・−${Number(miss) * penaltySec} 秒</span>` : '') + '</div>' : '') +
    `<p class="g-ovsub">${esc(sub)}</p></div>`;
  return ov;
}

/** v2「中」時間到：不能加時、不寫存檔；再試一次（同一盤、時間重算）或回地圖 */
export function showTimeUp(host, { left, orders, onRetry, onMap, sfx, misses = 0, penaltySec = 5, penaltyTotal = null, byMiss = false }) {
  const ov = overlay(host, 'g-timeupov');
  const n = Number(misses) || 0;
  ov.card.innerHTML = `<div class="g-tuclock" aria-hidden="true"><span class="g-clockico"></span></div>
    <h2 class="g-wintitle">時間到！</h2>
    <p class="g-tuleft">${orders ? '點單還差' : '還剩'} <b>${Number(left) || 0}</b> 對</p>` +
    // v2.1「中」：配錯扣秒的紀錄；最後一次配錯把時間扣光的話說一聲
    (n > 0 ? `<p class="g-tumiss">${byMiss ? '最後一次配錯，把時間扣光了<br>' : ''}配錯 <b>${n}</b> 次，共扣 ${penaltyTotal ?? n * penaltySec} 秒</p>` : '') +
    `<p class="g-ovsub">${n > 0 ? '想換選擇，先點一下原本選的取消就不會扣秒<br>' : ''}再試一次是同一盤，時間重新算</p>`;
  const foot = document.createElement('div'); foot.className = 'g-ov-foot g-tubtns';
  foot.appendChild(btn('再試一次', 'g-primary', () => { sfx('tap'); onRetry(); }));
  foot.appendChild(btn('回地圖', 'ghost', () => { sfx('tap'); onMap(); }));
  ov.card.appendChild(foot);
  return ov;
}
export function lightStar(ov, i) {
  const s = ov.card.querySelectorAll('.g-winstars i')[i];
  if (s) s.classList.add('on');
  return s;
}

/** 新甜點解鎖卡：剪影翻成完整圖＋糖粉；多張可以左右滑 */
export function unlockSection(ov, ids, { opening, onReveal, onPage }) {
  const sec = document.createElement('section');
  sec.className = 'g-unlock';
  sec.innerHTML = `<h3 class="g-unlock-h">${opening ? `開店禮！${ids.length} 種甜點進駐展示櫃` : '新甜點收進圖鑑了！'}</h3>`;
  const track = document.createElement('div');
  track.className = 'g-cards' + (ids.length > 1 ? ' g-multi' : '');
  const dots = document.createElement('div'); dots.className = 'g-dots';
  const stage = Math.min(156, Math.round(Math.min(window.innerWidth, 480) * 0.4));
  let api = null;
  const cards = ids.map((id, i) => {
    const d = DESSERT_BY_ID[id] || { name: id, orig: '', story: '', no: 0, bg: 'tea', region: 'fr' };
    const reg = REGION_BY_ID[d.region];
    const card = document.createElement('article');
    card.className = 'g-ucard g-locked';
    card.style.setProperty('--bg', TILE_BG[d.bg] || '#EADFD2');
    card.dataset.id = id;
    card.innerHTML = `<div class="g-ustage"><span class="g-uno">No.${String(d.no).padStart(3, '0')}</span>
        <canvas class="g-usil"></canvas><canvas class="g-ufull"></canvas></div>
      <div class="g-ubody"><p class="g-uname">${esc(d.name)}</p><div class="g-uorig">${esc(d.orig)}</div>
        <span class="g-uplace">${esc(d.place || (reg ? reg.flag + ' ' + reg.name : ''))}</span>
        <p class="g-ustory">${esc(d.story)}</p></div>`;
    track.appendChild(card);
    Art.renderSilhouette(card.querySelector('.g-usil'), id, stage, { doily: true });
    Art.renderShowcase(card.querySelector('.g-ufull'), id, stage);
    const dot = document.createElement('i'); if (i === 0) dot.className = 'on'; dots.appendChild(dot);
    dot.addEventListener('click', () => api.goTo(i));
    return card;
  });
  sec.appendChild(track);
  if (ids.length > 1) { sec.appendChild(dots); sec.insertAdjacentHTML('beforeend', '<p class="g-swipe">左右滑動看看 →</p>'); }
  ov.card.appendChild(sec);
  let cur = 0;
  const reveal = i => {
    const card = cards[i]; if (!card || !card.classList.contains('g-locked')) return;
    card.classList.remove('g-locked'); card.classList.add('g-just');
    onReveal && onReveal(card, i);
  };
  let st = 0;
  track.addEventListener('scroll', () => {
    clearTimeout(st);
    st = setTimeout(() => {
      const mid = track.scrollLeft + track.clientWidth / 2;
      let best = 0, bd = 1e9;
      cards.forEach((c, i) => { const dd = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (dd < bd) { bd = dd; best = i; } });
      if (best !== cur) { cur = best; onPage && onPage(best); }
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i === best));
      reveal(best);
    }, 90);
  }, { passive: true });
  api = {
    cards, reveal,
    current: () => ids[cur],
    goTo(i, smooth = true) { const c = cards[i]; if (c) track.scrollTo({ left: c.offsetLeft - (track.clientWidth - c.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' }); },
  };
  return api;
}

export function winButtons(ov, list) {
  const foot = document.createElement('div'); foot.className = 'g-ov-foot g-winbtns';
  for (const [text, cls, fn] of list) foot.appendChild(btn(text, cls, fn));
  ov.card.appendChild(foot);
  return foot;
}
