// D 介面共用小工具（D 擁有）。只給 js/ui/* 用。

/** HTML 跳脫 */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const reduceMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
};

/** 音效、音樂（F 的模組還沒好或出錯時不影響畫面） */
export function sfx(app, name, opts) { try { app.audio?.sfx?.(name, opts); } catch (e) { console.warn('sfx', e); } }
export function music(app, track) { try { app.audio?.playMusic?.(track); } catch (e) { console.warn('music', e); } }

/** 地區的 CSS 變數 */
export const regionVars = r => `--ra:${r.theme.accent};--rs:${r.theme.soft};--rd:${r.theme.deep}`;

/** 地區簡稱（圖鑑分頁用） */
export const SHORT_NAME = { fr: '法國', tw: '台灣', se: '南歐', us: '英美', jp: '日本' };
/** 地區英文（護照章用） */
export const LATIN_NAME = { fr: 'France', tw: 'Taiwan', se: 'Sud Europa', us: 'UK & USA', jp: 'Japan' };
/** 地區一句話（介面裝飾文字） */
export const REGION_LINE = {
  fr: '從巴黎街角的麵包店出發',
  tw: '還有菊島的家鄉味',
  se: '地中海的陽光和咖啡香',
  us: '英式下午茶與美式烘焙',
  jp: '細緻的和洋菓子',
};

/** 天人菊（澎湖縣花，紅心黃邊）小裝飾 SVG */
let flowerSeq = 0;
export function flower(size = 28, cls = '') {
  const id = 'u-fl' + (++flowerSeq);
  let petals = '';
  for (let i = 0; i < 12; i++) petals += `<use href="#${id}p" transform="rotate(${i * 30 + 8})"/>`;
  let dots = '';
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2, r = i % 2 ? 9.5 : 6;
    dots += `<circle cx="${(Math.cos(a) * r).toFixed(1)}" cy="${(Math.sin(a) * r).toFixed(1)}" r="1.6"/>`;
  }
  return `<svg class="u-flower ${cls}" width="${size}" height="${size}" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
<defs>
<linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="0" y1="-10" x2="0" y2="-47">
<stop offset="0" stop-color="#9E2228"/><stop offset=".45" stop-color="#D0402E"/><stop offset=".64" stop-color="#EC8F2C"/><stop offset=".78" stop-color="#F6C440"/><stop offset="1" stop-color="#FCE07A"/>
</linearGradient>
<radialGradient id="${id}c" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#A8532C"/><stop offset="1" stop-color="#561B10"/></radialGradient>
<path id="${id}p" d="M-4-9C-10-20-13-31-12-40L-8-47-4.5-42 0-48 4.5-42 8-47 12-40C13-31 10-20 4-9Z" fill="url(#${id}g)" stroke="#8E2E1C" stroke-opacity=".28" stroke-width="1"/>
</defs>
<g>${petals}</g>
<circle r="14.5" fill="url(#${id}c)"/>
<g fill="#E0A13E" opacity=".85">${dots}</g>
</svg>`;
}

/** 子畫面頂端：細遮陽棚＋返回鈕＋標題（sub：標題下方的小元件，例如難度標籤）＋右側資訊 */
export function topBar({ title, right = '', backLabel = '首頁', sub = '' }) {
  return `<div class="awning u-awning-thin"></div>
<header class="u-top">
  <button class="u-back" data-back aria-label="回${esc(backLabel)}"><span aria-hidden="true">‹</span> ${esc(backLabel)}</button>
  <div class="u-top-c"><h1 class="u-top-title">${esc(title)}</h1>${sub}</div>
  <div class="u-top-r">${right}</div>
</header>`;
}

/* ---------- 關卡與甜點（mode 省略＝目前難度） ---------- */

/** 最後一關的編號（依 REGIONS 的區間，不依 levels.js 目前有幾關） */
export const lastLevelId = app => Math.max(...app.config.REGIONS.map(r => r.levels[1]));

/** 關卡狀態：'nodata'（還沒有資料＝未開放）、'locked'、'open'、'cleared' */
export function levelState(app, id, mode) {
  if (!app.levelById(id, mode)) return 'nodata';
  if (app.save.levelStars(id, mode) > 0) return 'cleared';
  return app.save.isLevelOpen(id, mode) ? 'open' : 'locked';
}

/** 目前該玩的關：第一個有資料、已開放、還沒過的關；沒有就回傳 null */
export function currentLevelId(app, mode) {
  const last = lastLevelId(app);
  for (let id = 1; id <= last; id++) if (levelState(app, id, mode) === 'open') return id;
  return null;
}

/** 這個甜點在哪一關解鎖（找 levels 裡 unlocks 含它的關；易、中同一關解鎖同一個甜點） */
export const levelOfDessert = (app, id, mode) => app.levelsOf(mode || app.mode).find(l => (l.unlocks || []).includes(id)) || null;

export function debutText(app, id, mode) {
  const lv = levelOfDessert(app, id, mode);
  if (!lv) return '之後的關卡登場';
  return lv.id === 1 ? '第 1 關登場（開店禮）' : `第 ${lv.id} 關登場`;
}

/** 已過關數 */
export const clearedCount = (app, mode) => app.levelsOf(mode || app.mode).filter(l => app.save.levelStars(l.id, mode) > 0).length;

/** 秒數 → 「2:50」 */
export const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/* ---------- 難度（v2：易／中） ---------- */

/** 難度資料 { id, name:'易', title:'輕鬆模式', desc }（文字來自 config.MODES） */
export const modeInfo = (app, mode) => app.config.MODE_BY_ID[mode || app.mode] || app.config.MODES[0];
/** 「易・輕鬆模式」 */
export const modeLabel = (app, mode) => { const m = modeInfo(app, mode); return `${m.name}・${m.title}`; };

/** 某個難度的進度 */
export function modeProgress(app, mode) {
  const ids = new Set(app.data.DESSERTS.map(d => d.id));
  return {
    cleared: clearedCount(app, mode),
    stars: app.save.totalStars(mode),
    got: app.save.unlockedList(mode).filter(id => ids.has(id)).length,
    total: app.data.DESSERTS.length,
  };
}
/** 「已過 3 關・★ 8・圖鑑 9／55」 */
export function progressHtml(app, mode) {
  const p = modeProgress(app, mode);
  return `<span class="u-pg">已過 <b>${p.cleared}</b> 關</span><i>・</i><span class="u-pg"><b class="u-star" aria-hidden="true">★</b><span class="u-sr">星星</span> <b>${p.stars}</b></span><i>・</i><span class="u-pg">圖鑑 <b>${p.got}</b>／${p.total}</span>`;
}

/** 碼錶（挑戰模式）、茶杯（輕鬆模式）小圖示 */
export const ICON_CLOCK = `<svg class="u-ic-clock" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="13.6" r="7.6" fill="#fff" stroke="currentColor" stroke-width="2.2"/><path d="M12 9.6v4.3l2.8 1.7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.6 3h4.8M12 3v3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
export const ICON_TEA = `<svg class="u-ic-tea" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.6 10.2h13.2v2.4c0 3.7-2.9 6.6-6.6 6.6s-6.6-2.9-6.6-6.6Z" fill="#fff" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16.8 11.6c2.8-.5 3.9 3.6.3 4.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 7.4c-1-1.2 1-1.9 0-3.3M12.2 7.4c-1-1.2 1-1.9 0-3.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
export const modeIcon = mode => mode === 'mid' ? ICON_CLOCK : ICON_TEA;

/** 圓形難度徽章「易」「中」 */
export const modeBadge = (app, mode, cls = '') => `<span class="u-mbadge u-m-${esc(mode || app.mode)} ${cls}" aria-hidden="true">${esc(modeInfo(app, mode).name)}</span>`;

/** 目前難度的小標籤（按了要開難度選擇，畫面自己接 [data-mode-switch] 的 click） */
export function modeChip(app, { cls = '' } = {}) {
  const m = modeInfo(app);
  return `<button class="u-mchip u-m-${esc(m.id)} ${cls}" data-mode-switch aria-label="目前難度：${esc(m.name)}・${esc(m.title)}。點一下切換難度">
  <span class="u-mchip-k">難度</span>${modeBadge(app, m.id)}<span class="u-mchip-t">${esc(m.title)}</span><span class="u-mchip-sw">切換</span>
</button>`;
}

/**
 * 難度選擇（頁面內覆蓋層，不用 confirm()）。
 * 選了就 app.setMode(id)，再呼叫 onPick(id, changed)；關掉沒選呼叫 onClose()。
 * 覆蓋層掛在 #app 底下，換畫面時會跟著被清掉。回傳 { close }。
 */
export function chooseMode(app, { onPick, onClose, first = false } = {}) {
  document.querySelector('.u-mode-ov')?.remove();
  const chosen = app.save.modeChosen();
  const cur = app.mode;
  const host = document.getElementById('app') || document.body;
  const ov = document.createElement('div');
  ov.className = 'u-mode-ov';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-labelledby', 'u-mode-t');
  const opts = app.config.MODES.map(m => {
    const isCur = chosen && m.id === cur;
    return `
<button class="u-mode-opt u-m-${esc(m.id)}${isCur ? ' on' : ''}" data-pick="${esc(m.id)}" aria-label="${esc(m.name)}・${esc(m.title)}：${esc(m.desc)}${isCur ? '（目前）' : ''}">
  <span class="u-mode-big" aria-hidden="true">${esc(m.name)}<i>${modeIcon(m.id)}</i></span>
  <span class="u-mode-info">
    <b class="u-mode-name">${esc(m.name)}・${esc(m.title)}</b>
    <span class="u-mode-desc">${esc(m.desc)}</span>
    <span class="u-mode-prog">${progressHtml(app, m.id)}</span>
  </span>
  ${isCur ? '<span class="u-mode-now">目前</span>' : ''}
</button>`;
  }).join('');
  ov.innerHTML = `
<div class="u-mode-bg" data-mclose></div>
<div class="card u-mode-card">
  <button class="u-mode-x" data-mclose aria-label="關閉">×</button>
  <h2 class="u-mode-title" id="u-mode-t">${flower(18)} ${first ? '先選一個難度吧' : '選擇難度'} ${flower(18)}</h2>
  <p class="u-mode-sub">${first ? '之後隨時可以在首頁或地圖切換' : '隨時都可以換回來，進度不會不見'}</p>
  <div class="u-mode-list">${opts}</div>
  <p class="u-mode-foot">「易」和「中」的星星、圖鑑分開收集</p>
</div>`;
  host.appendChild(ov);
  document.documentElement.classList.add('u-noscroll');
  sfx(app, 'tap');

  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', onKey);
    ov.remove();
    document.documentElement.classList.remove('u-noscroll');
  };
  function onKey(e) {
    if (!ov.isConnected) { close(); return; }
    if (e.key === 'Escape') { sfx(app, 'tap'); close(); onClose?.(); }
  }
  window.addEventListener('keydown', onKey);
  ov.addEventListener('click', e => {
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const id = pick.dataset.pick;
      sfx(app, 'tap');
      const changed = id !== app.mode;
      app.setMode(id);
      close();
      onPick?.(id, changed);
      return;
    }
    if (e.target.closest('[data-mclose]')) { sfx(app, 'tap'); close(); onClose?.(); }
  });
  (ov.querySelector('.u-mode-opt.on') || ov.querySelector('.u-mode-opt'))?.focus({ preventScroll: true });
  return { close };
}

/** 切換難度的固定流程：開選擇 → 換了就提示 → 重畫（rerender 自己決定要不要 app.go） */
export function switchMode(app, rerender) {
  return chooseMode(app, {
    onPick: (id, changed) => {
      if (changed) app.toast(`已切換到「${modeLabel(app, id)}」`);
      rerender(id, changed);
    },
  });
}

/** 資料裡少數網址的右括號被切掉了（例如 …Croissant_(viennoiserie），補回來 */
export function fixUrl(url) {
  let u = String(url || '');
  const open = (u.match(/\(/g) || []).length, close = (u.match(/\)/g) || []).length;
  if (open > close) u += ')'.repeat(open - close);
  return /^https?:\/\//.test(u) ? u : '#';
}

/** 糖粉＋小星星噴發（position: fixed，掛在 host 底下，畫面卸載時一起清掉） */
export function burst(host, cx, cy, dist) {
  if (reduceMotion() || !host) return;
  const colors = ['#F7B6C8', '#FFE08A', '#BFE3F5', '#CBEFD9', '#FFFFFF', '#E9D5FF'];
  for (let i = 0; i < 9; i++) {
    const s = document.createElement('div');
    const isStar = i % 3 === 0;
    s.className = isStar ? 'u-burst-star' : 'u-burst-dot';
    const col = colors[i % colors.length];
    if (isStar) { s.textContent = '✦'; s.style.color = col === '#FFFFFF' ? '#FFD36E' : col; }
    else s.style.background = col;
    s.style.left = cx - 4 + 'px'; s.style.top = cy - 4 + 'px';
    host.appendChild(s);
    const a = Math.random() * Math.PI * 2, d = dist * (0.6 + Math.random() * 0.6);
    const anim = s.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(.3)`, opacity: 0 },
    ], { duration: 520 + Math.random() * 200, easing: 'cubic-bezier(.2,.7,.3,1)' });
    anim.onfinish = () => s.remove();
  }
}
