// 啟動與畫面切換（主代理擁有）。
// 每個畫面模組 default export { mount(root, params, app), unmount() }；mount 可以是 async。
import * as config from './config.js';
import * as data from './data/desserts.js';
import { LEVELS } from './data/levels.js';
import { LEVELS as LEVELS_MID } from './data/levels_mid.js';
import { save } from './save.js';
import audio from './audio.js';
import { loadArt, Art } from './art/index.js';

import home from './ui/home.js';
import map from './ui/map.js';
import book from './ui/book.js';
import settings from './ui/settings.js';
import level from './game/gameScreen.js';

const SCREENS = { home, map, book, settings, level };
const root = document.getElementById('app');
let current = null;
let toastTimer = 0;

const LEVELS_OF = { easy: LEVELS, mid: LEVELS_MID };

export const app = {
  config, data, save, audio, art: Art,
  /** 目前難度 'easy' | 'mid'（存在 save 裡） */
  get mode() { return save.mode(); },
  /** 目前難度的 50 關 */
  get levels() { return LEVELS_OF[save.mode()]; },
  levelsOf: mode => LEVELS_OF[mode] || LEVELS_OF[save.mode()],
  setMode(m) { save.setMode(m); },
  screen: null,
  /** 切換畫面：name 為 SCREENS 的鍵，params 原封不動傳給 mount */
  async go(name, params = {}) {
    const next = SCREENS[name];
    if (!next) { console.error('沒有這個畫面', name); return; }
    try { current?.unmount?.(); } catch (e) { console.error(e); }
    root.innerHTML = '';
    const el = document.createElement('div');
    el.className = `screen screen-${name}`;
    root.appendChild(el);
    current = next;
    app.screen = name;
    window.scrollTo(0, 0);
    await next.mount(el, params, app);
  },
  /** 頂部小提示 */
  toast(msg, ms = 1800) {
    document.querySelector('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), ms);
  },
  levelById: (id, mode) => (LEVELS_OF[mode] || LEVELS_OF[save.mode()]).find(l => l.id === id),
};

// iOS 要在使用者第一次觸控時解鎖聲音（含靜音模式處理，見 audio.js）
const unlock = () => audio.unlock();
['pointerdown', 'touchend', 'click'].forEach(ev => window.addEventListener(ev, unlock, { capture: true }));
audio.setSfx(save.settings().sfx);
audio.setMusic(save.settings().music);

// 開發用：?screen=level&level=3、?screen=book、加 &unlockall=1
const q = new URLSearchParams(location.search);
await loadArt();
const startScreen = q.get('screen') || 'home';
const startParams = q.get('level') ? { levelId: Number(q.get('level')) } : {};
// 開發用：&mode=mid 直接切到「中」（會寫入存檔）
if (q.get('mode') === 'easy' || q.get('mode') === 'mid') save.setMode(q.get('mode'));
await app.go(startScreen, startParams);
// 開場載入動畫：首頁準備好了，讓小編衝到 100%（見 js/loading.js）
window.__loader?.ready();

// PWA：網路優先的 service worker（開發時不會卡舊檔）
if ('serviceWorker' in navigator && !q.has('nosw')) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('sw 註冊失敗', e));
}
window.app = app; // 方便測試腳本操作
