// 設定：音樂、音效、各難度進度與重置（頁面內二次確認）、製作資訊（D 擁有）。畫面合約見 架構.md。
import { esc, flower, sfx, music, topBar, progressHtml, modeInfo, modeLabel, modeIcon, switchMode } from './common.js';

let off = [];

/** 把 CREDITS.md 整理成安全的 HTML（只支援標題、清單、表格、粗體、連結） */
function mdToHtml(md) {
  const links = [];
  const inline = s => {
    let t = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, txt, url) => { links.push([txt, url]); return `\u0000${links.length - 1}\u0000`; });
    t = esc(t)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/(https?:\/\/[^\s<)，。、]+)/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
    return t.replace(/\u0000(\d+)\u0000/g, (m, i) => `<a href="${esc(links[i][1])}" target="_blank" rel="noopener noreferrer">${esc(links[i][0])}</a>`);
  };
  const out = [];
  let list = false, tableHead = true;
  const closeList = () => { if (list) { out.push('</ul>'); list = false; } };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { closeList(); tableHead = true; continue; }
    let m;
    if ((m = line.match(/^#{1,6}\s+(.*)$/))) { closeList(); out.push(`<p class="u-md-h">${inline(m[1])}</p>`); continue; }
    if (line.startsWith('|')) {
      if (/^\|[\s:|-]+\|?$/.test(line)) continue;                 // 表格分隔線
      const cells = line.replace(/^\||\|$/g, '').split('|').map(c => c.trim()).filter(Boolean);
      if (!list) { out.push('<ul>'); list = true; }
      out.push(`<li${tableHead ? ' class="u-md-th"' : ''}>${cells.map(inline).join('・')}</li>`);
      tableHead = false;
      continue;
    }
    if ((m = line.match(/^[-*+]\s+(.*)$/))) {
      if (!list) { out.push('<ul>'); list = true; }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    closeList();
    const text = line.replace(/^>\s?/, '').trim();
    if (text) out.push(`<p>${inline(text)}</p>`);
  }
  closeList();
  return out.join('');
}

/** CREDITS.md 裡如果有「設定頁…製作資訊」那一節，就只顯示那段，其餘收進「完整授權資訊」；沒有就整份顯示 */
function creditsHtml(md) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex(l => /^#{1,6}\s+.*(設定頁|製作資訊)/.test(l.trim()));
  if (start < 0) return mdToHtml(md);
  let end = lines.findIndex((l, i) => i > start && /^#{1,6}\s/.test(l.trim()));
  if (end < 0) end = lines.length;
  const brief = lines.slice(start + 1, end).join('\n').trim();
  const rest = [...lines.slice(0, start), ...lines.slice(end)].join('\n').trim();
  if (!brief) return mdToHtml(md);
  return mdToHtml(brief) + (rest ? `<details class="u-src u-cr-more"><summary>完整授權資訊</summary>${mdToHtml(rest)}</details>` : '');
}

const sw = (key, on, label, note) => `
<div class="u-set-row">
  <div><b>${label}</b><small>${note}</small></div>
  <button class="u-switch${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${label}" data-key="${key}"><i></i></button>
</div>`;

export default {
  async mount(root, params, app) {
    const save = app.save;
    const st = save.settings();
    const MODES = app.config.MODES;
    const cur = app.mode;
    const chosen = save.modeChosen();

    // 各難度一列：徽章、名稱、進度
    const progRows = MODES.map(m => `
<div class="u-prog-row u-m-${esc(m.id)}${m.id === cur ? ' on' : ''}">
  <span class="u-mode-big u-mode-sm" aria-hidden="true">${esc(m.name)}<i>${modeIcon(m.id)}</i></span>
  <div class="u-prog-t">
    <b>${esc(m.name)}・${esc(m.title)}${m.id === cur && chosen ? '<span class="u-mode-now">目前</span>' : ''}</b>
    <span class="u-mode-prog">${progressHtml(app, m.id)}</span>
  </div>
</div>`).join('');

    root.innerHTML = `
${topBar({ title: '設定' })}
<div class="u-settings">
  <section class="card u-set-card">
    <h2 class="u-set-h">聲音</h2>
    ${sw('music', st.music, '背景音樂', '輕快的甜點店音樂')}
    ${sw('sfx', st.sfx, '音效', '點選、擠奶油、吃甜點的聲音')}
  </section>

  <section class="card u-set-card">
    <h2 class="u-set-h">遊戲進度</h2>
    <div class="u-prog-list">${progRows}</div>
    <div class="u-set-modeline">
      <p>兩種難度的星星和圖鑑分開記</p>
      <button class="btn ghost u-set-sw" data-mode-switch>切換難度</button>
    </div>
    <div class="u-reset">
      <p class="u-reset-h">重置進度</p>
      <div class="u-reset-btns">
        ${MODES.map(m => `<button class="btn ghost u-danger" data-reset="${esc(m.id)}">重置「${esc(m.name)}」</button>`).join('')}
      </div>
      <div class="u-confirm" hidden role="alertdialog" aria-labelledby="u-confirm-t">
        <p id="u-confirm-t"></p>
        <div class="u-confirm-btns">
          <button class="btn ghost" data-cancel>我再想想</button>
          <button class="btn u-danger-solid" data-confirm>確定重置</button>
        </div>
      </div>
    </div>
  </section>

  <section class="card u-set-card u-credits">
    <h2 class="u-set-h">製作資訊</h2>
    <p class="u-cr-ver">菊島連連烘 <b>版本 v2.1</b>・「中」新增同甜點分色（同色才能配）、配錯扣 5 秒</p>
    <p class="u-cr-h">音樂與音效</p>
    <div class="u-music-credits"><p class="u-muted">讀取中…</p></div>
    <p class="u-cr-h">插畫</p>
    <p>甜點、飲品和道具都是用程式一筆一筆畫出來的原創插畫。</p>
    <p class="u-about">${flower(18)} 「菊島」是澎湖的別名，澎湖的縣花是紅心黃邊的天人菊。</p>
  </section>
</div>`;

    // 音樂、音效開關
    root.querySelectorAll('.u-switch').forEach(b => b.addEventListener('click', () => {
      const key = b.dataset.key;
      const v = !b.classList.contains('on');
      b.classList.toggle('on', v);
      b.setAttribute('aria-checked', String(v));
      save.setSetting(key, v);
      try {
        if (key === 'sfx') { app.audio?.setSfx?.(v); if (v) sfx(app, 'tap'); }
        else app.audio?.setMusic?.(v);
      } catch (e) { console.warn(e); }
    }));

    // 切換難度：選完重畫設定頁
    root.querySelector('[data-mode-switch]').addEventListener('click', () => switchMode(app, () => app.go('settings')));

    // 重置進度：先選「易」或「中」，再頁面內二次確認（只清那個難度）
    const confirmBox = root.querySelector('.u-confirm');
    const resetBtns = root.querySelector('.u-reset-btns');
    let resetMode = null;
    root.querySelectorAll('[data-reset]').forEach(b => b.addEventListener('click', () => {
      sfx(app, 'tap');
      resetMode = b.dataset.reset;
      const m = modeInfo(app, resetMode);
      const other = MODES.find(x => x.id !== resetMode);
      confirmBox.querySelector('p').innerHTML = `<b>真的要重置「${esc(m.name)}・${esc(m.title)}」嗎？</b><br>這個難度的星星、過關紀錄和圖鑑收集都會清空，沒辦法復原喔。${other ? `<br><small>「${esc(other.name)}」的進度不會受影響。</small>` : ''}`;
      confirmBox.classList.remove('u-m-easy', 'u-m-mid');
      confirmBox.classList.add('u-m-' + resetMode);
      confirmBox.hidden = false;
      resetBtns.hidden = true;
      root.querySelector('[data-cancel]').focus({ preventScroll: true });
    }));
    root.querySelector('[data-cancel]').addEventListener('click', () => {
      sfx(app, 'tap');
      resetMode = null;
      confirmBox.hidden = true;
      resetBtns.hidden = false;
    });
    root.querySelector('[data-confirm]').addEventListener('click', () => {
      if (!resetMode) return;
      sfx(app, 'tap');
      save.resetMode(resetMode);
      app.toast(`「${modeLabel(app, resetMode)}」的進度已重置`);
      app.go('settings');
    });

    root.querySelector('[data-back]').addEventListener('click', () => { sfx(app, 'tap'); app.go('home'); });
    music(app, 'home');

    // 音樂出處：讀 F 建立的 CREDITS.md
    const box = root.querySelector('.u-music-credits');
    let alive = true;
    off.push(() => { alive = false; });
    try {
      const res = await fetch('assets/music/CREDITS.md', { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      const md = (await res.text()).trim();
      if (!alive) return;
      box.innerHTML = md ? creditsHtml(md) : '<p class="u-muted">音樂資訊準備中</p>';
    } catch (e) {
      if (alive) box.innerHTML = '<p class="u-muted">音樂資訊準備中</p>';
    }
  },
  unmount() { off.forEach(f => f()); off = []; },
};
